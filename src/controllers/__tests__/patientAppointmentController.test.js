const {
  getDoctors,
  bookAppointment,
  getPatientAppointments,
} = require('../patientAppointmentController');
const User = require('../../models/User');
const Patient = require('../../models/Patient');
const Appointment = require('../../models/Appointment');
const { fetchDoctors } = require('../../utils/doctorQuery');

jest.mock('../../models/User');
jest.mock('../../models/Patient');
jest.mock('../../models/Appointment');
jest.mock('../../utils/doctorQuery');

// A future date (today + 7 days, YYYY-MM-DD) used wherever a valid upcoming
// booking date is needed. Hardcoded dates rot as the clock advances and start
// hitting the past-date guard (audit FE/BE test rot).
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

  it('getDoctors delegates to fetchDoctors', async () => {
    const result = {
      data: [{ _id: 'doc-1', name: 'Dr. Rajesh', role: { slug: 'doctor' } }],
      count: 1,
      pagination: { total: 1, page: 1, pages: 1, limit: 50 },
    };
    fetchDoctors.mockResolvedValue(result);

    const req = { query: { search: 'Rajesh' } };
    const res = createRes();
    const next = jest.fn();

    await getDoctors(req, res, next);

    expect(fetchDoctors).toHaveBeenCalledWith({ search: 'Rajesh' });
    expect(res.json).toHaveBeenCalledWith({ success: true, ...result });
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
    Patient.findById.mockResolvedValue({ _id: 'pat-profile-id', name: 'Test Patient', dependents: [] });
    Appointment.findOne.mockResolvedValue(null);
    Appointment.create.mockResolvedValue(created);
    Appointment.findById.mockReturnValue(createQueryChain(populated));

    const req = {
      body: { doctorId: 'doc-id', date: futureDate(), time: '10:00', reason: 'Checkup' },
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

    expect(Appointment.find).toHaveBeenCalledWith({ patient: 'pat-profile-id', deletedAt: null });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: appointments });
  });
});
