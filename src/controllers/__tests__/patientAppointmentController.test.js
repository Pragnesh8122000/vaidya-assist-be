const {
  getDoctors,
  bookAppointment,
  getPatientAppointments,
} = require('../patientAppointmentController');
const User = require('../../models/User');
const Appointment = require('../../models/Appointment');

jest.mock('../../models/User');
jest.mock('../../models/Appointment');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function createQueryChain(result, { populateCalls = 1, hasSort = false } = {}) {
  let count = 0;
  const sortChain = { sort: jest.fn().mockResolvedValue(result) };
  const chain = {
    populate: jest.fn().mockImplementation(() => {
      count += 1;
      return count === populateCalls
        ? (hasSort ? sortChain : Promise.resolve(result))
        : chain;
    }),
  };
  return chain;
}

describe('patientAppointmentController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getDoctors filters users with doctor role', async () => {
    const doctorRole = { slug: 'doctor' };
    const assistantRole = { slug: 'assistant' };
    User.find.mockReturnValue(createQueryChain([
      { _id: 'doc-1', name: 'Dr. Rajesh', role: doctorRole },
      { _id: 'usr-2', name: 'Priya', role: assistantRole },
    ]));

    const req = {};
    const res = createRes();
    const next = jest.fn();

    await getDoctors(req, res, next);

    expect(User.find).toHaveBeenCalledWith({ role: { $exists: true } });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ _id: 'doc-1', name: 'Dr. Rajesh', role: doctorRole }],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('bookAppointment validates required fields', async () => {
    const req = {
      body: { doctorId: 'doc-id' },
      user: { _id: 'pat-id', patientProfile: 'pat-profile-id' },
      clinicId: 'clinic-uuid',
    };
    const res = createRes();
    const next = jest.fn();

    await bookAppointment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Doctor, date and time are required.',
    }));
  });

  it('bookAppointment creates appointment with doctor clinicId', async () => {
    const doctor = {
      _id: 'doc-id',
      name: 'Dr. Rajesh',
      role: { slug: 'doctor' },
      clinicId: 'clinic-uuid',
    };
    const created = { _id: 'apt-id' };
    const populated = { _id: 'apt-id', doctor: { name: 'Dr. Rajesh' } };

    User.findById.mockReturnValue(createQueryChain(doctor));
    Appointment.findOne.mockResolvedValue(null);
    Appointment.create.mockResolvedValue(created);
    Appointment.findById.mockReturnValue(createQueryChain(populated));

    const req = {
      body: { doctorId: 'doc-id', date: '2026-06-28', time: '10:00', reason: 'Checkup' },
      user: { _id: 'pat-id', patientProfile: 'pat-profile-id' },
      clinicId: 'clinic-uuid',
    };
    const res = createRes();
    const next = jest.fn();

    await bookAppointment(req, res, next);

    expect(Appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patient: 'pat-profile-id',
        doctor: 'doc-id',
        time: '10:00',
        reason: 'Checkup',
        clinicId: 'clinic-uuid',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('bookAppointment rejects past dates', async () => {
    const req = {
      body: { doctorId: 'doc-id', date: '2020-01-01', time: '10:00' },
      user: { _id: 'pat-id', patientProfile: 'pat-profile-id' },
    };
    const res = createRes();
    const next = jest.fn();

    await bookAppointment(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Cannot book an appointment in the past.',
    }));
  });

  it('getPatientAppointments returns patient appointments', async () => {
    const appointments = [{ _id: 'apt-1' }];
    Appointment.find.mockReturnValue(createQueryChain(appointments, { hasSort: true }));

    const req = {
      user: { _id: 'pat-id', patientProfile: 'pat-profile-id' },
      query: {},
    };
    const res = createRes();
    const next = jest.fn();

    await getPatientAppointments(req, res, next);

    expect(Appointment.find).toHaveBeenCalledWith({ patient: 'pat-profile-id' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: appointments });
  });
});
