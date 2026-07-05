const {
  getAppointmentReport,
  getPatientReport,
  getMedicineReport,
} = require('../reportController');
const Appointment = require('../../models/Appointment');
const Patient = require('../../models/Patient');
const Medicine = require('../../models/Medicine');

jest.mock('../../models/Appointment');
jest.mock('../../models/Patient');
jest.mock('../../models/Medicine');

function createRes() {
  const headers = {};
  return {
    setHeader: jest.fn((k, v) => { headers[k] = v; }),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    _headers: headers,
  };
}

// Build a chainable that supports populate().sort().skip().limit() and resolves
// to `result` at the end. Each chainable method returns `self` so the chain
// stays on the same object; awaiting `self` resolves to `result`.
function chain(result) {
  const self = {};
  self.populate = jest.fn(() => self);
  self.sort = jest.fn(() => self);
  self.skip = jest.fn(() => self);
  self.limit = jest.fn(() => Promise.resolve(result));
  self.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return self;
}

describe('reportController SEC-9 CSV escaping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exportAppointmentCSV prefixes = + - @ and doubles embedded quotes', async () => {
    Appointment.find.mockReturnValue(chain([
      {
        date: new Date('2026-01-01'),
        time: '10:00',
        patient: { name: '=cmd|calc' },
        doctor: { name: 'Dr "Evil"' },
        status: 'Waiting',
        reason: '-bad',
        notes: '@import',
      },
    ]));
    Appointment.countDocuments.mockResolvedValue(1);

    const req = { query: { format: 'csv' } };
    const res = createRes();
    const next = jest.fn();

    await getAppointmentReport(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    const sent = res.send.mock.calls[0][0];
    // Formula-injection guard: leading operators get an apostrophe prefix.
    expect(sent).toContain("'=cmd|calc");
    expect(sent).toContain("'-bad");
    expect(sent).toContain("'@import");
    // Embedded double-quotes are doubled.
    expect(sent).toContain('Dr ""Evil""');
    expect(next).not.toHaveBeenCalled();
  });

  it('exportPatientCSV escapes formula injection in name/address', async () => {
    Patient.find.mockReturnValue(chain([
      { name: '=1+1', age: 40, gender: 'Male', phone: '555', email: 'a@b.com', bloodGroup: 'O+', address: '+5 5 5' },
    ]));

    const req = { query: { format: 'csv' } };
    const res = createRes();
    const next = jest.fn();

    await getPatientReport(req, res, next);

    const sent = res.send.mock.calls[0][0];
    expect(sent).toContain("'=1+1");
    expect(sent).toContain("'+5 5 5");
  });

  it('exportMedicineCSV escapes formula injection in name/supplier', async () => {
    Medicine.find.mockReturnValue(chain([
      { name: '@evil', genericName: '', stock: 5, batchNumber: '', expiryDate: null, supplier: '-co', price: 10, category: '' },
    ]));

    const req = { query: { format: 'csv' } };
    const res = createRes();
    const next = jest.fn();

    await getMedicineReport(req, res, next);

    const sent = res.send.mock.calls[0][0];
    expect(sent).toContain("'@evil");
    expect(sent).toContain("'-co");
  });
});

describe('reportController PERF-8 pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated appointments when limit is set', async () => {
    Appointment.countDocuments.mockResolvedValue(25);
    Appointment.find.mockReturnValue(chain(Array(10).fill({ date: new Date(), time: '10:00' })));

    const req = { query: { page: 2, limit: 10 } };
    const res = createRes();
    const next = jest.fn();

    await getAppointmentReport(req, res, next);

    expect(Appointment.countDocuments).toHaveBeenCalledWith({ deletedAt: null });
    const findArg = Appointment.find.mock.calls[0][0];
    expect(findArg).toEqual({ deletedAt: null });
    // skip/limit applied
    const chainObj = Appointment.find.mock.results[0].value;
    expect(chainObj.skip).toHaveBeenCalledWith(10);
    expect(chainObj.limit).toHaveBeenCalledWith(10);
    const payload = res.json.mock.calls[0][0];
    expect(payload.pagination).toEqual({ total: 25, page: 2, pages: 3 });
  });

  it('returns all matching appointments (no pagination) when limit is absent', async () => {
    Appointment.countDocuments.mockResolvedValue(3);
    Appointment.find.mockReturnValue(chain([{ date: new Date(), time: '10:00' }]));

    const req = { query: {} };
    const res = createRes();
    const next = jest.fn();

    await getAppointmentReport(req, res, next);

    const chainObj = Appointment.find.mock.results[0].value;
    // skip/limit should NOT be invoked when limit is absent.
    expect(chainObj.skip).not.toHaveBeenCalled();
    expect(chainObj.limit).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.pagination).toBeUndefined();
    expect(payload.total).toBe(3);
  });
});