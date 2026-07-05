const {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  addMedicalNote,
} = require('../patientController');
const Patient = require('../../models/Patient');

jest.mock('../../models/Patient');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('patientController clinic scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getPatients scopes by clinicId and applies search', async () => {
    Patient.countDocuments.mockResolvedValue(0);
    Patient.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });

    const req = {
      query: { search: 'amit' },
      clinicId: 'clinic-uuid',
      user: { _id: 'doc-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await getPatients(req, res, next);

    expect(Patient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic-uuid',
        $or: [
          { name: { $regex: 'amit', $options: 'i' } },
          { phone: { $regex: 'amit', $options: 'i' } },
          { email: { $regex: 'amit', $options: 'i' } },
        ],
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  function createPopulateChain(result, populateCalls) {
    let count = 0;
    const chain = {
      populate: jest.fn().mockImplementation(() => {
        count += 1;
        return count === populateCalls ? Promise.resolve(result) : chain;
      }),
    };
    return chain;
  }

  it('getPatient returns 404 for a patient outside the clinic', async () => {
    Patient.findOne.mockReturnValue(createPopulateChain(null, 2));

    // 24-char hex — exercises BOTH branches of buildAliasQuery.
    const patId = '507f1f77bcf86cd799439011';
    const req = { params: { id: patId }, clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await getPatient(req, res, next);

    expect(Patient.findOne).toHaveBeenCalledWith({ $or: [{ _id: patId }, { displayId: patId }], clinicId: 'clinic-uuid' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('createPatient validates name and trims it', async () => {
    const created = { _id: 'pat-id', name: 'Amit Verma' };
    Patient.create.mockResolvedValue(created);

    const req = {
      body: { name: '  Amit Verma  ', age: 35 },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
    };
    const res = createRes();
    const next = jest.fn();

    await createPatient(req, res, next);

    expect(Patient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Amit Verma',
        age: 35,
        createdBy: 'doc-id',
        clinicId: 'clinic-uuid',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createPatient rejects missing name', async () => {
    const req = { body: {}, user: { _id: 'doc-id', clinicId: 'clinic-uuid' } };
    const res = createRes();
    const next = jest.fn();

    await createPatient(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Patient.create).not.toHaveBeenCalled();
  });

  it('SEC-7: createPatient strips non-allowlisted fields (clinicId/createdBy/user/dependents/_id)', async () => {
    const created = { _id: 'pat-id', name: 'Amit' };
    Patient.create.mockResolvedValue(created);

    const req = {
      body: {
        name: 'Amit',
        age: 35,
        clinicId: 'attacker-clinic',
        createdBy: 'attacker',
        user: 'attacker-user',
        dependents: [{ name: 'evil' }],
        _id: 'forged-id',
        displayId: 'PT_FORGED',
      },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
    };
    const res = createRes();
    const next = jest.fn();

    await createPatient(req, res, next);

    expect(Patient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Amit',
        age: 35,
        createdBy: 'doc-id',
        clinicId: 'clinic-uuid',
      }),
    );
    const payload = Patient.create.mock.calls[0][0];
    expect(payload.clinicId).toBe('clinic-uuid');
    expect(payload.createdBy).toBe('doc-id');
    expect(payload.user).toBeUndefined();
    expect(payload.dependents).toBeUndefined();
    expect(payload._id).toBeUndefined();
    expect(payload.displayId).toBeUndefined();
  });

  it('SEC-7: updatePatient allow-lists and ignores clinicId/createdBy/_id/medicalNotes', async () => {
    const updated = { _id: 'pat-id', name: 'Updated' };
    Patient.findOneAndUpdate.mockResolvedValue(updated);

    const patId = '507f1f77bcf86cd799439011';
    const req = {
      params: { id: patId },
      body: {
        name: 'Updated',
        phone: '555-1234',
        clinicId: 'other',
        createdBy: 'other',
        _id: 'forged',
        medicalNotes: [{ note: 'evil' }],
        displayId: 'PT_FORGED',
      },
      clinicId: 'clinic-uuid',
      user: { _id: 'doc-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await updatePatient(req, res, next);

    expect(Patient.findOneAndUpdate).toHaveBeenCalledWith(
      { $or: [{ _id: patId }, { displayId: patId }], clinicId: 'clinic-uuid' },
      { name: 'Updated', phone: '555-1234' },
      { new: true, runValidators: true },
    );
  });

  it('updatePatient strips clinicId/createdBy and scopes by clinic', async () => {
    const updated = { _id: 'pat-id', name: 'Updated' };
    Patient.findOneAndUpdate.mockResolvedValue(updated);

    const patId = '507f1f77bcf86cd799439011';
    const req = {
      params: { id: patId },
      body: { name: 'Updated', clinicId: 'other', createdBy: 'other' },
      clinicId: 'clinic-uuid',
      user: { _id: 'doc-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await updatePatient(req, res, next);

    expect(Patient.findOneAndUpdate).toHaveBeenCalledWith(
      { $or: [{ _id: patId }, { displayId: patId }], clinicId: 'clinic-uuid' },
      { name: 'Updated' },
      { new: true, runValidators: true },
    );
  });

  it('deletePatient scopes by clinic', async () => {
    Patient.findOneAndDelete.mockResolvedValue(null);

    const missingId = '507f1f77bcf86cd799439099';
    const req = { params: { id: missingId }, clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await deletePatient(req, res, next);

    expect(Patient.findOneAndDelete).toHaveBeenCalledWith({ $or: [{ _id: missingId }, { displayId: missingId }], clinicId: 'clinic-uuid' });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('addMedicalNote scopes by clinic', async () => {
    const patient = { medicalNotes: { push: jest.fn() }, save: jest.fn().mockResolvedValue() };
    Patient.findOne.mockResolvedValue(patient);

    const patId = '507f1f77bcf86cd799439011';
    const req = {
      params: { id: patId },
      body: { note: 'Follow-up required' },
      clinicId: 'clinic-uuid',
      user: { _id: 'doc-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await addMedicalNote(req, res, next);

    expect(Patient.findOne).toHaveBeenCalledWith({ $or: [{ _id: patId }, { displayId: patId }], clinicId: 'clinic-uuid' });
    expect(patient.medicalNotes.push).toHaveBeenCalledWith({ note: 'Follow-up required', createdBy: 'doc-id' });
  });
});
