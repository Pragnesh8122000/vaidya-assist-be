const {
  getMedicines,
  getMedicine,
  createMedicine,
  updateMedicine,
  deleteMedicine,
} = require('../medicineController');
const Medicine = require('../../models/Medicine');

jest.mock('../../models/Medicine');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('medicineController clinic scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getMedicines scopes by clinicId and applies search', async () => {
    Medicine.countDocuments.mockResolvedValue(0);
    Medicine.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) });

    const req = {
      query: { search: 'para' },
      clinicId: 'clinic-uuid',
      user: { _id: 'doc-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await getMedicines(req, res, next);

    expect(Medicine.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-uuid',
        $or: [
          { name: { $regex: 'para', $options: 'i' } },
          { genericName: { $regex: 'para', $options: 'i' } },
        ],
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getMedicine returns 404 for a medicine outside the clinic', async () => {
    Medicine.findOne.mockResolvedValue(null);

    const req = { params: { id: 'med-id' }, clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await getMedicine(req, res, next);

    expect(Medicine.findOne).toHaveBeenCalledWith({ _id: 'med-id', clinicId: 'clinic-uuid' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('createMedicine validates required fields', async () => {
    const req = { body: {}, user: { _id: 'doc-id', clinicId: 'clinic-uuid' } };
    const res = createRes();
    const next = jest.fn();

    await createMedicine(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Medicine.create).not.toHaveBeenCalled();
  });

  it('updateMedicine strips clinicId/createdBy and scopes by clinic', async () => {
    const updated = { _id: 'med-id', name: 'Updated' };
    Medicine.findOneAndUpdate.mockResolvedValue(updated);

    const req = {
      params: { id: 'med-id' },
      body: { name: 'Updated', clinicId: 'other', createdBy: 'other' },
      clinicId: 'clinic-uuid',
      user: { _id: 'doc-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await updateMedicine(req, res, next);

    expect(Medicine.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'med-id', clinicId: 'clinic-uuid' },
      { name: 'Updated' },
      { new: true, runValidators: true },
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  it('deleteMedicine scopes by clinic', async () => {
    Medicine.findOneAndDelete.mockResolvedValue(null);

    const req = { params: { id: 'missing-id' }, clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await deleteMedicine(req, res, next);

    expect(Medicine.findOneAndDelete).toHaveBeenCalledWith({ _id: 'missing-id', clinicId: 'clinic-uuid' });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
