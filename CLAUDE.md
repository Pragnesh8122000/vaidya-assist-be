# Vaidya Assist — Main Backend

Node.js + Express + MongoDB (Mongoose) backend for doctors and clinic staff.

## Auth

- JWT Bearer tokens (`Authorization: Bearer <token>`).
- `req.user` is populated by `src/middleware/auth.js` with the full `User` document + populated `role`/`permissions`.
- Token expiry returns `code: 'TOKEN_EXPIRED'`.
- `checkPermission(...slugs)` treats `role.slug === 'doctor'` as super-admin.

## Relevant permission slugs

- `view_medicines`, `manage_medicines`
- `view_appointments`, `manage_appointments`

## Key routes

- `/api/medicines` — CRUD + `/low-stock` + `/expiring-soon`
- `/api/appointments` — CRUD + `/calendar`
- `/api/patients`
- `/api/auth`
- `/api/users`

## Conventions

- Controllers return `{ success: true, data: ..., pagination: {...} }`.
- Models are in `src/models/`.
- Routes apply `auth` middleware and `checkPermission` where needed.
- Socket.IO instance is available via `req.app.get('io')`.

## Agent-service integration

The agent-service calls this backend over HTTP. When adding endpoints for the agent:
- Reuse existing `auth` middleware.
- Filter by `doctorId`/`clinicId` on the server side.
- Consider validating an optional `X-Service-Key` header for service-to-service calls.

For full project context, see the project-level memory files.
