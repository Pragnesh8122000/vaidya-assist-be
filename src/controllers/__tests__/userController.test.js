const {
  createRole,
  updateRole,
  deleteRole,
  getRoles,
} = require('../userController');
const User = require('../../models/User');
const Role = require('../../models/Role');

jest.mock('../../models/User');
jest.mock('../../models/Role');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('userController role allowlists (SEC-7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createRole builds from allow-list only; strips _id / __v / timestamps', async () => {
    const created = { _id: 'role-id', name: 'Nurse', slug: 'nurse' };
    Role.create.mockResolvedValue(created);
    Role.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: 'role-id', name: 'Nurse' }),
    });

    const req = {
      body: {
        name: 'Nurse',
        slug: 'nurse',
        description: 'Ward nurse',
        permissions: ['perm-1'],
        _id: 'forged',
        __v: 0,
        createdAt: '2020-01-01',
        unknownField: 'evil',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await createRole(req, res, next);

    expect(Role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nurse',
        slug: 'nurse',
        description: 'Ward nurse',
        permissions: ['perm-1'],
      }),
    );
    const payload = Role.create.mock.calls[0][0];
    expect(payload._id).toBeUndefined();
    expect(payload.__v).toBeUndefined();
    expect(payload.createdAt).toBeUndefined();
    expect(payload.unknownField).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateRole allow-lists the update payload', async () => {
    Role.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: 'role-id', name: 'Nurse 2' }),
    });

    const req = {
      params: { id: 'role-id' },
      body: {
        name: 'Nurse 2',
        _id: 'forged',
        __v: 0,
        unknownField: 'evil',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await updateRole(req, res, next);

    expect(Role.findByIdAndUpdate).toHaveBeenCalledWith(
      'role-id',
      { name: 'Nurse 2' },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('deleteRole refuses when users are still assigned', async () => {
    User.countDocuments.mockResolvedValue(2);

    const req = { params: { id: 'role-id' } };
    const res = createRes();
    const next = jest.fn();

    await deleteRole(req, res, next);

    expect(User.countDocuments).toHaveBeenCalledWith({ role: 'role-id' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Role.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('getRoles returns all roles populated with permissions', async () => {
    Role.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([{ _id: 'role-id', name: 'Nurse' }]),
    });

    const req = {};
    const res = createRes();
    const next = jest.fn();

    await getRoles(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [{ _id: 'role-id', name: 'Nurse' }] })
    );
  });
});