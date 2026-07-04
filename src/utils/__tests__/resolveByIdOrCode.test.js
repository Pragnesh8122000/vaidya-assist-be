const { buildAliasQuery, OBJECT_ID_RE } = require('../resolveByIdOrCode');

describe('buildAliasQuery', () => {
  test('ObjectId-shaped id includes both _id and code branches', () => {
    const oid = '507f1f77bcf86cd799439011';
    const q = buildAliasQuery(oid, 'displayId', { deletedAt: null });
    expect(q.deletedAt).toBeNull();
    expect(q.$or).toEqual([
      { _id: oid },
      { displayId: oid },
    ]);
  });

  test('non-ObjectId id (public code) only includes the code branch', () => {
    const code = 'APP_202607041430';
    const q = buildAliasQuery(code, 'displayId');
    expect(q.$or).toEqual([{ displayId: code }]);
  });

  test('empty string does not produce a stray _id branch', () => {
    // An empty id (from a malformed request) should not match every doc
    // by _id — only by the code field, which also won't match.
    const q = buildAliasQuery('', 'displayId');
    expect(q.$or).toEqual([{ displayId: '' }]);
  });

  test('extras are merged at the top level, not inside $or', () => {
    const q = buildAliasQuery('APP_202607041430', 'displayId', {
      deletedAt: null,
      clinicId: 'clinic-1',
    });
    expect(q.deletedAt).toBeNull();
    expect(q.clinicId).toBe('clinic-1');
    expect(q.$or).toEqual([{ displayId: 'APP_202607041430' }]);
  });

  test('works with the User username field too', () => {
    const q = buildAliasQuery('dr.rajesh.sharma', 'username', {});
    expect(q.$or).toEqual([{ username: 'dr.rajesh.sharma' }]);
  });

  test('uppercase hex ObjectId is still recognized', () => {
    const oid = '507F1F77BCF86CD799439011';
    expect(OBJECT_ID_RE.test(oid)).toBe(true);
    const q = buildAliasQuery(oid, 'displayId');
    expect(q.$or).toContainEqual({ _id: oid });
  });

  test('25-char hex is NOT recognized as an ObjectId', () => {
    const tooLong = '507f1f77bcf86cd7994390111';
    expect(OBJECT_ID_RE.test(tooLong)).toBe(false);
    const q = buildAliasQuery(tooLong, 'displayId');
    expect(q.$or).toEqual([{ displayId: tooLong }]);
  });
});
