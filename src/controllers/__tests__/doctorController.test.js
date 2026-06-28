const { getDoctors } = require('../doctorController');
const { fetchDoctors } = require('../../utils/doctorQuery');

jest.mock('../../utils/doctorQuery');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('doctorController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctors with count and pagination', async () => {
    const result = {
      data: [
        { _id: 'doc-1', name: 'Dr. Rajesh Sharma', email: 'doctor@vaidya.com', phone: '+91-9000000000' },
      ],
      count: 1,
      pagination: { total: 1, page: 1, pages: 1, limit: 50 },
    };
    fetchDoctors.mockResolvedValue(result);

    const req = { query: {} };
    const res = createRes();
    const next = jest.fn();

    await getDoctors(req, res, next);

    expect(fetchDoctors).toHaveBeenCalledWith({ page: undefined, limit: undefined, search: undefined });
    expect(res.json).toHaveBeenCalledWith({ success: true, ...result });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes query params to fetchDoctors', async () => {
    fetchDoctors.mockResolvedValue({ data: [], count: 0, pagination: { total: 0, page: 2, pages: 0, limit: 10 } });

    const req = { query: { page: '2', limit: '10', search: 'Rajesh' } };
    const res = createRes();
    const next = jest.fn();

    await getDoctors(req, res, next);

    expect(fetchDoctors).toHaveBeenCalledWith({ page: '2', limit: '10', search: 'Rajesh' });
    expect(res.json).toHaveBeenCalled();
  });

  it('calls next on error', async () => {
    const error = new Error('DB failure');
    fetchDoctors.mockRejectedValue(error);

    const req = { query: {} };
    const res = createRes();
    const next = jest.fn();

    await getDoctors(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
