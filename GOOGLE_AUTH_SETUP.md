# Google Sign-In Setup Guide

This guide covers configuring Google Sign-In for the Vaidya Assist platform across all three repositories.

## Overview

Google Sign-In is an **additional** login method alongside the existing email/password flow. The behavior differs by role:

| Role | Can sign up via Google? | Can sign in via Google? | Auto-creates account? |
|------|--------------------------|--------------------------|------------------------|
| Patient | ✅ Yes | ✅ Yes | ✅ Yes (profileComplete: false) |
| Doctor/Admin | ❌ No | ✅ Yes (existing accounts only) | ❌ No — must be provisioned by admin |

Account linking happens automatically: if a user signs in with Google using an email that already has a password account, the accounts are merged (`authProvider` becomes `'both'`).

---

## 1. Google Cloud Console Setup

### Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services → Credentials**.
4. Click **Create Credentials → OAuth client ID**.
5. Select **Web application** as the application type.
6. Configure:
   - **Name**: `Vaidya Assist` (or your preferred name)
   - **Authorized JavaScript origins**: Add all domains where your frontends run:
     - `http://localhost:5173` (patient app dev)
     - `http://localhost:5174` (doctor/admin app dev)
     - `https://your-production-domain.com`
   - **Authorized redirect URIs**: Leave empty (Google Sign-In uses One Tap, not redirect flow)
7. Click **Create**.
8. Copy the **Client ID** — you'll need it for all three repos.

> ⚠️ **Never expose your Client Secret in frontend code.** The Client ID is safe to embed in frontend apps; the Client Secret is only needed if you implement server-side OAuth flows (which we don't — we verify ID tokens).

### Enable the Google Identity Toolkit

The `@react-oauth/google` package uses Google Identity Services (GIS), which requires no additional API enablement beyond the OAuth client.

---

## 2. Backend Configuration (vaidya-assist-be)

### Environment Variables

Add to your `.env` file:

```env
# Required: Google OAuth Client ID (same as frontend)
GOOGLE_CLIENT_ID=your_google_client_id_here
```

### Dependencies

The backend uses `google-auth-library` for server-side ID token verification:

```bash
npm install google-auth-library
```

This dependency is already listed in `package.json` after the implementation.

### What the Backend Does

- **`POST /api/auth/google`**: Verifies the Google ID token server-side using `google-auth-library`, then:
  - Finds an existing user by email → logs them in, links Google if not already linked
  - No existing user + role=patient → auto-creates account with `profileComplete: false`
  - No existing user + role=doctor/admin → returns 403 with a clear message
  - Deactivated accounts → returns 401
  - Unverified Google email → returns 403
- **`PATCH /api/auth/complete-profile`**: Allows Google-signed-up patients to complete required profile fields (phone is mandatory). Sets `profileComplete: true`.
- **`POST /api/auth/login`**: Now checks if an account is Google-only (`authProvider === 'google'` with no password) and returns a clear message directing the user to use Google Sign-In instead.

### Rate Limiting

The `/api/auth/google` endpoint is protected by the same `authLimiter` as login and register (10 requests per 15 minutes per IP).

### User Schema Changes

| Field | Type | Description |
|-------|------|-------------|
| `googleId` | String, unique, sparse | Google account ID (`sub` claim) |
| `authProvider` | String, enum: `password`/`google`/`both` | Tracks which auth methods are available |
| `profileComplete` | Boolean, default `true` | `false` for Google-created patient accounts that need profile completion |
| `password` | String | Now conditionally required — not needed for `authProvider: 'google'` accounts |

Existing users default to `authProvider: 'password'` and `profileComplete: true`, so this is a non-breaking change.

---

## 3. Patient App Configuration (vaidya-assist-appointment)

### Environment Variables

Add to your `.env` file:

```env
# Required: Same Google Client ID as backend
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

### Dependencies

```bash
npm install @react-oauth/google
```

### Key Files

| File | Change |
|------|--------|
| `src/main.tsx` | Wraps `<App>` with `<GoogleOAuthProvider>` |
| `src/features/authSlice.ts` | Added `googleLogin` and `completeProfile` async thunks |
| `src/pages/Login.tsx` | Added `<GoogleLogin>` component with "or" divider |
| `src/pages/CompleteProfile.tsx` | New page for Google sign-ups to complete their profile |
| `src/App.tsx` | Added `/complete-profile` route (authenticated only) |

### Profile Completion Flow

When a new patient signs up via Google:

1. Backend creates the user with `profileComplete: false`
2. Frontend receives `profileComplete: false` in the auth response
3. `googleLogin.fulfilled` handler checks `profileComplete` and redirects to `/complete-profile`
4. Patient fills in required fields (phone is mandatory)
5. `PATCH /api/auth/complete-profile` sets `profileComplete: true`
6. Patient is redirected to the dashboard

---

## 4. Doctor/Admin App Configuration (vaidya-assist-fe)

### Environment Variables

Add to your `.env` file:

```env
# Required: Same Google Client ID as backend
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

### Dependencies

```bash
npm install @react-oauth/google
```

### Key Files

| File | Change |
|------|--------|
| `src/main.jsx` | Wraps `<App>` with `<GoogleOAuthProvider>` |
| `src/features/authSlice.js` | Added `googleLogin` async thunk (sends `role: 'doctor'`) |
| `src/pages/Login.jsx` | Added `<GoogleLogin>` component with "or" divider |

### Doctor-Only Behavior

The doctor app always sends `role: 'doctor'` in the Google login request. If no matching account exists, the backend returns a 403 error with the message:

> "No account found for this email. Please contact your clinic administrator."

This error is displayed to the user via the standard error Alert and toast notification. No account is auto-created.

---

## 5. Account Linking Behavior

When a user who previously signed up with email/password signs in with Google for the first time:

| Before | After |
|--------|-------|
| `authProvider: 'password'` | `authProvider: 'both'` |
| `googleId: null` | `googleId: 'google-sub-id'` |
| `password: 'hashed...'` | `password: 'hashed...'` (unchanged) |

The user can now sign in with **either** email/password or Google Sign-In.

### Google-Only Accounts

Users created via Google Sign-In have:

- `authProvider: 'google'`
- `password: null` (no password set)
- `profileComplete: false` (patients only)

If a Google-only user tries to sign in with email/password on the login form, they'll see:

> "This account uses Google Sign-In. Please sign in with Google."

---

## 6. Security Considerations

1. **Server-side token verification**: The backend verifies Google ID tokens using `google-auth-library` — never trust client-side decoded claims.
2. **Email verification check**: The backend rejects Google tokens where `email_verified` is `false`.
3. **Rate limiting**: The `/api/auth/google` endpoint is rate-limited identically to other auth endpoints.
4. **No Client Secret in frontend**: Only the Client ID is embedded in frontend code. The Client Secret is never used (we use the authorization code flow via GIS, not a server-side OAuth redirect).
5. **Same JWT structure**: Regardless of auth method, the backend issues the same JWT shape (`{ id, doctorId, clinicId }`), ensuring consistent downstream behavior.

---

## 7. Testing

### Backend Tests

```bash
cd vaidya-assist-be
npx jest src/controllers/__tests__/googleAuthController.test.js --verbose
```

Covers: existing user login, new patient creation, doctor rejection, email verification, invalid token, missing token, account linking, Google-only re-login, deactivated account, and complete profile (success, already complete, missing phone).

### Frontend Tests (Doctor/Admin App)

```bash
cd vaidya-assist-fe
npx vitest run src/features/googleAuth.test.jsx
```

Covers: `googleLogin` thunk (success, failure, 403 rejection, request body), Login page Google button rendering, click handling, error display, and divider presence.

### Frontend Tests (Patient App)

The patient app does not currently have test infrastructure (no vitest or testing-library). Adding Google Sign-In tests for R1 requires first setting up the test framework, which is a separate task.

---

## 8. Production Deployment Checklist

- [ ] Set `GOOGLE_CLIENT_ID` in backend `.env` (or Render environment variables)
- [ ] Set `VITE_GOOGLE_CLIENT_ID` in patient app `.env`
- [ ] Set `VITE_GOOGLE_CLIENT_ID` in doctor/admin app `.env`
- [ ] Add production domain to Google Cloud Console authorized origins
- [ ] Run `npm run seed` on the backend to ensure the `patient` role exists
- [ ] Verify existing users default to `authProvider: 'password'` and `profileComplete: true`
- [ ] Test the complete flow: Google sign-in for an existing doctor, Google sign-up for a new patient, profile completion redirect