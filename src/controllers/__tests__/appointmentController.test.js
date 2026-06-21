const {
  getTodayAppointments,
  getUpcomingAppointments,
} = require('../appointmentController');
const Appointment = require('../../models/Appointment');

jest.mock('../../models/Appointment');

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

describe('appointmentController agent endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getTodayAppointments queries today by doctor', async () => {
    const result = [{ _id: 'a1', time: '10:00' }];
    Appointment.find.mockReturnValue(createTodayQuery(result));

    const req = { user: { _id: 'doc-object-id' } };
    const res = createRes();
    const next = jest.fn();

    await getTodayAppointments(req, res, next);

    expect(Appointment.find).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor: 'doc-object-id',
        date: expect.any(Object),
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
    expect(next).not.toHaveBeenCalled();
  });

  it('getUpcomingAppointments queries future appointments by doctor with default limit', async () => {
    const result = [{ _id: 'a2', time: '11:00' }];
    Appointment.find.mockReturnValue(createUpcomingQuery(result));

    const req = { user: { _id: 'doc-object-id' }, query: {} };
    const res = createRes();
    const next = jest.fn();

    await getUpcomingAppointments(req, res, next);

    expect(Appointment.find).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor: 'doc-object-id',
        date: expect.any(Object),
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it('getUpcomingAppointments respects custom limit', async () => {
    const result = [];
    Appointment.find.mockReturnValue(createUpcomingQuery(result));

    const req = { user: { _id: 'doc-object-id' }, query: { limit: '5' } };
    const res = createRes();
    const next = jest.fn();

    await getUpcomingAppointments(req, res, next);

    // The mocked chain ignores the actual limit value, but we can verify limit was called
    const chain = Appointment.find.mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(5);
  });
});
