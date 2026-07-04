const {
  getDashboardStats,
  getAppointmentChart,
  getPatientVisitStats,
  getMedicineStockChart,
  getAppointmentStatusDist,
} = require('../dashboardController');
const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const Medicine = require('../../models/Medicine');

jest.mock('../../models/Appointment');
jest.mock('../../models/Patient');
jest.mock('../../models/Medicine');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('dashboardController clinic scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getDashboardStats scopes counts by clinicId', async () => {
    Patient.countDocuments = jest.fn().mockResolvedValue(8);
    Appointment.countDocuments = jest.fn().mockResolvedValue(3);
    Medicine.countDocuments = jest.fn().mockResolvedValue(10);

    const req = { clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await getDashboardStats(req, res, next);

    expect(Patient.countDocuments).toHaveBeenCalledWith({ clinicId: 'clinic-uuid' });
    expect(Medicine.countDocuments).toHaveBeenCalledWith({ clinicId: 'clinic-uuid' });
    expect(Appointment.countDocuments).toHaveBeenCalledTimes(2);
    expect(Appointment.countDocuments).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ clinicId: 'clinic-uuid', date: expect.any(Object) })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { totalPatients: 8, todayAppointments: 3, pendingAppointments: 3, totalMedicines: 10, lowStockMedicines: 10 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('getAppointmentChart scopes aggregation by clinicId', async () => {
    Appointment.aggregate = jest.fn().mockResolvedValue([]);

    const req = { clinicId: 'clinic-uuid', query: {} };
    const res = createRes();
    const next = jest.fn();

    await getAppointmentChart(req, res, next);

    const matchStage = Appointment.aggregate.mock.calls[0][0][0];
    expect(matchStage).toEqual(expect.objectContaining({ $match: expect.objectContaining({ clinicId: 'clinic-uuid' }) }));
  });

  it('getPatientVisitStats scopes aggregation by clinicId', async () => {
    Appointment.aggregate = jest.fn().mockResolvedValue([]);

    const req = { clinicId: 'clinic-uuid', query: {} };
    const res = createRes();
    const next = jest.fn();

    await getPatientVisitStats(req, res, next);

    const matchStage = Appointment.aggregate.mock.calls[0][0][0];
    expect(matchStage).toEqual(expect.objectContaining({ $match: expect.objectContaining({ clinicId: 'clinic-uuid' }) }));
  });

  it('getMedicineStockChart scopes aggregation by clinicId', async () => {
    Medicine.aggregate = jest.fn().mockResolvedValue([]);

    const req = { clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await getMedicineStockChart(req, res, next);

    const matchStage = Medicine.aggregate.mock.calls[0][0][0];
    expect(matchStage).toEqual(expect.objectContaining({ $match: { clinicId: 'clinic-uuid' } }));
  });

  it('getAppointmentStatusDist scopes aggregation by clinicId', async () => {
    Appointment.aggregate = jest.fn().mockResolvedValue([]);

    const req = { clinicId: 'clinic-uuid' };
    const res = createRes();
    const next = jest.fn();

    await getAppointmentStatusDist(req, res, next);

    const matchStage = Appointment.aggregate.mock.calls[0][0][0];
    expect(matchStage).toEqual(expect.objectContaining({ $match: { clinicId: 'clinic-uuid', deletedAt: null } }));
  });
});
