const {
  getTodayAppointments,
  getUpcomingAppointments,
  createAppointment,
  updateAppointment,
  getAppointment,
  deleteAppointment,
} = require('../appointmentController');
const Appointment = require('../../models/Appointment');

jest.mock('../../models/Appointment');

// A future date (today + N days, YYYY-MM-DD) used wherever a valid upcoming
// booking date is needed. Hardcoded dates rot as the clock advances and start
// hitting the past-date guard (audit BE-5 / FE/BE test rot).
function futureDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function createTodayQuery(result) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockResolvedValue(result),
  };
}

function createUpcomingQuery(result) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  };
}

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

describe('appointmentController agent endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getTodayAppointments queries today by doctor and clinic', async () => {
    const result = [{ _id: 'a1', time: '10:00' }];
    Appointment.find.mockReturnValue(createTodayQuery(result));

    const req = { user: { _id: 'doc-object-id' }, clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await getTodayAppointments(req, res, next);

    expect(Appointment.find).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor: 'doc-object-id',
        date: expect.any(Object),
        clinicId: 'clinic-uuid',
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
    expect(next).not.toHaveBeenCalled();
  });

  it('getUpcomingAppointments queries future appointments by doctor with default limit', async () => {
    const result = [{ _id: 'a2', time: '11:00' }];
    Appointment.find.mockReturnValue(createUpcomingQuery(result));

    const req = { user: { _id: 'doc-object-id' }, clinicId: 'clinic-uuid', query: {} };
    const res = createRes();
    const next = jest.fn();

    await getUpcomingAppointments(req, res, next);

    expect(Appointment.find).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor: 'doc-object-id',
        date: expect.any(Object),
        clinicId: 'clinic-uuid',
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it('getUpcomingAppointments respects custom limit', async () => {
    const result = [];
    Appointment.find.mockReturnValue(createUpcomingQuery(result));

    const req = { user: { _id: 'doc-object-id' }, clinicId: 'clinic-uuid', query: { limit: '5' } };
    const res = createRes();
    const next = jest.fn();

    await getUpcomingAppointments(req, res, next);

    // The mocked chain ignores the actual limit value, but we can verify limit was called
    const chain = Appointment.find.mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(5);
  });
});

describe('appointmentController create/update/delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createApp() {
    return {
      get: jest.fn(),
    };
  }

  it('createAppointment validates required fields', async () => {
    const req = {
      body: { date: '2026-06-28' },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
      clinicId: 'clinic-uuid',
      app: createApp(),
    };
    const res = createRes();
    const next = jest.fn();

    await createAppointment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Validation Error',
        errors: expect.arrayContaining(['Patient is required.', 'Time is required and must be in HH:MM format.']),
      }),
    );
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  it('createAppointment creates and populates an appointment', async () => {
    const created = { _id: 'apt-id' };
    const populated = { _id: 'apt-id', patient: { name: 'Amit' } };

    Appointment.create.mockResolvedValue(created);
    Appointment.findById.mockReturnValue(createPopulateChain(populated, 3));

    const req = {
      body: { patient: 'patient-id', date: futureDate(), time: '10:00', reason: 'Checkup' },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
      clinicId: 'clinic-uuid',
      app: createApp(),
    };
    const res = createRes();
    const next = jest.fn();

    await createAppointment(req, res, next);

    expect(Appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patient: 'patient-id',
        doctor: 'doc-id',
        createdBy: 'doc-id',
        clinicId: 'clinic-uuid',
        date: expect.any(Date),
        time: '10:00',
        reason: 'Checkup',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: populated });
    expect(next).not.toHaveBeenCalled();
  });

  it('createAppointment returns 409 on duplicate slot', async () => {
    const err = new Error('Duplicate key');
    err.code = 11000;
    Appointment.create.mockRejectedValue(err);

    const req = {
      body: { patient: 'patient-id', date: futureDate(), time: '10:00' },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
      clinicId: 'clinic-uuid',
      app: createApp(),
    };
    const res = createRes();
    const next = jest.fn();

    await createAppointment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'This time slot is already booked.' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('updateAppointment strips protected fields and scopes by clinic', async () => {
    // 24-char hex — exercises BOTH branches of buildAliasQuery.
    const aptId = '507f1f77bcf86cd799439011';
    const existing = { _id: aptId, status: 'Waiting', doctor: 'doc-id', date: new Date(futureDate()), time: '10:00' };
    const updated = { _id: aptId, status: 'Completed' };
    // BE-7: updateAppointment now pre-fetches the existing record for transition
    // + reschedule re-validation before calling findOneAndUpdate.
    Appointment.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(existing),
    });
    // BE-6: validateStatusTransition is auto-mocked — default it to allow the
    // Waiting → Completed transition this test exercises.
    Appointment.validateStatusTransition.mockReturnValue(true);
    Appointment.findOneAndUpdate.mockReturnValue(createPopulateChain(updated, 2));

    const req = {
      params: { id: aptId },
      body: { status: 'Completed', doctor: 'other-doc', patient: 'other-patient', clinicId: 'other-clinic' },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
      clinicId: 'clinic-uuid',
      app: createApp(),
    };
    const res = createRes();
    const next = jest.fn();

    await updateAppointment(req, res, next);

    expect(Appointment.findOneAndUpdate).toHaveBeenCalledWith(
      { $or: [{ _id: aptId }, { displayId: aptId }], clinicId: 'clinic-uuid', deletedAt: null },
      expect.objectContaining({
        status: 'Completed',
        // BE-16: status change stamps the audit trail with the actor + timestamp.
        lastStatusChangedBy: 'doc-id',
        lastStatusChangedAt: expect.any(Date),
      }),
      { new: true, runValidators: true },
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  it('deleteAppointment scopes by clinic and returns 404 if not found', async () => {
    // BE-8: deleteAppointment now soft-deletes (findOne + save) instead of
    // findOneAndDelete.
    Appointment.findOne.mockResolvedValue(null);

    const missingId = '507f1f77bcf86cd799439099';
    const req = {
      params: { id: missingId },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
      clinicId: 'clinic-uuid',
      app: createApp(),
    };
    const res = createRes();
    const next = jest.fn();

    await deleteAppointment(req, res, next);

    expect(Appointment.findOne).toHaveBeenCalledWith({ $or: [{ _id: missingId }, { displayId: missingId }], clinicId: 'clinic-uuid', deletedAt: null });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('getAppointment scopes by clinic', async () => {
    const aptId = '507f1f77bcf86cd799439011';
    const appointment = { _id: aptId };
    Appointment.findOne.mockReturnValue(createPopulateChain(appointment, 3));

    const req = {
      params: { id: aptId },
      user: { _id: 'doc-id', clinicId: 'clinic-uuid' },
      clinicId: 'clinic-uuid',
    };
    const res = createRes();
    const next = jest.fn();

    await getAppointment(req, res, next);

    expect(Appointment.findOne).toHaveBeenCalledWith({ $or: [{ _id: aptId }, { displayId: aptId }], clinicId: 'clinic-uuid', deletedAt: null });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: appointment });
  });
});

