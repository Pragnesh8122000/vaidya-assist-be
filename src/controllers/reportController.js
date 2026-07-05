const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// PERF-8: parse optional page/limit pagination params. Exports
// (pdf/excel/csv) always fetch the full matching set, so they ignore
// these. JSON responses honour `page`/`limit`; when `limit` is absent
// the endpoint returns everything (preserves the original behaviour
// for any older caller). Returns `{ paginate, skip, limit, page }`.
function parsePagination(req) {
  const page = parseInt(req.query.page, 10);
  const limit = parseInt(req.query.limit, 10);
  const paginate = Number.isFinite(limit) && limit > 0;
  const skip = paginate && Number.isFinite(page) && page > 0 ? (page - 1) * limit : 0;
  return { paginate, skip, limit, page: paginate ? page || 1 : 1 };
}

// Generate Appointment Report
exports.getAppointmentReport = async (req, res, next) => {
  try {
    const { startDate, endDate, status, format = 'json' } = req.query;
    const query = {};

    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;

    // Exclude soft-deleted appointments (audit BE-8).
    query.deletedAt = null;

    if (format !== 'json') {
      // Exports need the full matching dataset, no pagination.
      const appointments = await Appointment.find(query)
        .populate('patient', 'name phone')
        .populate('doctor', 'name')
        .sort({ date: 1, time: 1 });
      if (format === 'pdf') return exportAppointmentPDF(res, appointments, startDate, endDate);
      if (format === 'excel') return exportAppointmentExcel(res, appointments);
      if (format === 'csv') return exportAppointmentCSV(res, appointments);
    }

    const { paginate, skip, limit, page } = parsePagination(req);
    const total = await Appointment.countDocuments(query);
    let findQuery = Appointment.find(query)
      .populate('patient', 'name phone')
      .populate('doctor', 'name')
      .sort({ date: 1, time: 1 });
    if (paginate) findQuery = findQuery.skip(skip).limit(limit);
    const appointments = await findQuery;

    const response = { success: true, data: appointments, total };
    if (paginate) response.pagination = { total, page, pages: Math.ceil(total / limit) };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

// Generate Patient Report
exports.getPatientReport = async (req, res, next) => {
  try {
    const { format = 'json', gender, bloodGroup } = req.query;
    const query = {};
    if (gender) query.gender = gender;
    if (bloodGroup) query.bloodGroup = bloodGroup;

    if (format !== 'json') {
      const patients = await Patient.find(query).populate('createdBy', 'name').sort('name');
      if (format === 'pdf') return exportPatientPDF(res, patients);
      if (format === 'excel') return exportPatientExcel(res, patients);
      if (format === 'csv') return exportPatientCSV(res, patients);
    }

    const { paginate, skip, limit, page } = parsePagination(req);
    const total = await Patient.countDocuments(query);
    let findQuery = Patient.find(query).populate('createdBy', 'name').sort('name');
    if (paginate) findQuery = findQuery.skip(skip).limit(limit);
    const patients = await findQuery;

    const response = { success: true, data: patients, total };
    if (paginate) response.pagination = { total, page, pages: Math.ceil(total / limit) };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

// Generate Medicine Report
exports.getMedicineReport = async (req, res, next) => {
  try {
    const { format = 'json', category, lowStock } = req.query;
    const query = {};
    if (category) query.category = category;
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
    }

    if (format !== 'json') {
      const medicines = await Medicine.find(query).sort('name');
      if (format === 'pdf') return exportMedicinePDF(res, medicines);
      if (format === 'excel') return exportMedicineExcel(res, medicines);
      if (format === 'csv') return exportMedicineCSV(res, medicines);
    }

    const { paginate, skip, limit, page } = parsePagination(req);
    const total = await Medicine.countDocuments(query);
    let findQuery = Medicine.find(query).sort('name');
    if (paginate) findQuery = findQuery.skip(skip).limit(limit);
    const medicines = await findQuery;

    const response = { success: true, data: medicines, total };
    if (paginate) response.pagination = { total, page, pages: Math.ceil(total / limit) };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

// PDF Exports
function exportAppointmentPDF(res, appointments, startDate, endDate) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=appointment_report.pdf');
  doc.pipe(res);

  doc.fontSize(18).text('Appointment Report', { align: 'center' });
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  if (startDate && endDate) {
    doc.text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
  }
  doc.moveDown();

  // Table header
  const tableTop = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Date', 40, tableTop, { width: 80 });
  doc.text('Time', 120, tableTop, { width: 50 });
  doc.text('Patient', 170, tableTop, { width: 120 });
  doc.text('Doctor', 290, tableTop, { width: 120 });
  doc.text('Status', 410, tableTop, { width: 80 });
  doc.text('Reason', 490, tableTop, { width: 80 });

  doc.moveTo(40, doc.y + 5).lineTo(560, doc.y + 5).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8);

  appointments.forEach(apt => {
    if (doc.y > 750) { doc.addPage(); }
    const y = doc.y;
    doc.text(new Date(apt.date).toLocaleDateString(), 40, y, { width: 80 });
    doc.text(apt.time, 120, y, { width: 50 });
    doc.text(apt.patient?.name || 'N/A', 170, y, { width: 120 });
    doc.text(apt.doctor?.name || 'N/A', 290, y, { width: 120 });
    doc.text(apt.status, 410, y, { width: 80 });
    doc.text(apt.reason || '', 490, y, { width: 80 });
    doc.moveDown(0.3);
  });

  doc.moveDown();
  doc.fontSize(9).text(`Total: ${appointments.length} appointments`, { align: 'right' });
  doc.end();
}

function exportPatientPDF(res, patients) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=patient_report.pdf');
  doc.pipe(res);

  doc.fontSize(18).text('Patient Report', { align: 'center' });
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(9).font('Helvetica-Bold');
  const tableTop = doc.y;
  doc.text('Name', 40, tableTop, { width: 120 });
  doc.text('Age', 160, tableTop, { width: 30 });
  doc.text('Gender', 190, tableTop, { width: 50 });
  doc.text('Phone', 240, tableTop, { width: 100 });
  doc.text('Blood', 340, tableTop, { width: 40 });
  doc.text('Address', 380, tableTop, { width: 180 });

  doc.moveTo(40, doc.y + 5).lineTo(560, doc.y + 5).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8);

  patients.forEach(p => {
    if (doc.y > 750) { doc.addPage(); }
    const y = doc.y;
    doc.text(p.name, 40, y, { width: 120 });
    doc.text(p.age?.toString() || '', 160, y, { width: 30 });
    doc.text(p.gender || '', 190, y, { width: 50 });
    doc.text(p.phone || '', 240, y, { width: 100 });
    doc.text(p.bloodGroup || '', 340, y, { width: 40 });
    doc.text(p.address || '', 380, y, { width: 180 });
    doc.moveDown(0.3);
  });

  doc.moveDown();
  doc.fontSize(9).text(`Total: ${patients.length} patients`, { align: 'right' });
  doc.end();
}

function exportMedicinePDF(res, medicines) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=medicine_report.pdf');
  doc.pipe(res);

  doc.fontSize(18).text('Medicine Inventory Report', { align: 'center' });
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(9).font('Helvetica-Bold');
  const tableTop = doc.y;
  doc.text('Name', 40, tableTop, { width: 130 });
  doc.text('Stock', 170, tableTop, { width: 40 });
  doc.text('Batch', 210, tableTop, { width: 90 });
  doc.text('Expiry', 300, tableTop, { width: 70 });
  doc.text('Supplier', 370, tableTop, { width: 90 });
  doc.text('Price', 460, tableTop, { width: 50 });
  doc.text('Category', 510, tableTop, { width: 60 });

  doc.moveTo(40, doc.y + 5).lineTo(560, doc.y + 5).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8);

  medicines.forEach(m => {
    if (doc.y > 750) { doc.addPage(); }
    const y = doc.y;
    doc.text(m.name, 40, y, { width: 130 });
    doc.text(m.stock.toString(), 170, y, { width: 40 });
    doc.text(m.batchNumber || '', 210, y, { width: 90 });
    doc.text(m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : '', 300, y, { width: 70 });
    doc.text(m.supplier || '', 370, y, { width: 90 });
    doc.text(`₹${m.price}`, 460, y, { width: 50 });
    doc.text(m.category || '', 510, y, { width: 60 });
    doc.moveDown(0.3);
  });

  doc.moveDown();
  doc.fontSize(9).text(`Total: ${medicines.length} medicines`, { align: 'right' });
  doc.end();
}

// Excel Exports
async function exportAppointmentExcel(res, appointments) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Appointments');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Time', key: 'time', width: 10 },
    { header: 'Patient', key: 'patient', width: 25 },
    { header: 'Doctor', key: 'doctor', width: 25 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Reason', key: 'reason', width: 25 },
    { header: 'Notes', key: 'notes', width: 30 }
  ];

  appointments.forEach(a => {
    sheet.addRow({
      date: new Date(a.date).toLocaleDateString(),
      time: a.time,
      patient: a.patient?.name || 'N/A',
      doctor: a.doctor?.name || 'N/A',
      status: a.status,
      reason: a.reason || '',
      notes: a.notes || ''
    });
  });

  // Style header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1565C0' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=appointment_report.xlsx');
  await workbook.xlsx.write(res);
  res.end();
}

async function exportPatientExcel(res, patients) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Patients');

  sheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Age', key: 'age', width: 8 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Blood Group', key: 'bloodGroup', width: 12 },
    { header: 'Address', key: 'address', width: 30 }
  ];

  patients.forEach(p => {
    sheet.addRow({ name: p.name, age: p.age, gender: p.gender, phone: p.phone, email: p.email, bloodGroup: p.bloodGroup, address: p.address });
  });

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1565C0' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=patient_report.xlsx');
  await workbook.xlsx.write(res);
  res.end();
}

async function exportMedicineExcel(res, medicines) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Medicines');

  sheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Generic Name', key: 'genericName', width: 20 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Batch', key: 'batch', width: 18 },
    { header: 'Expiry', key: 'expiry', width: 15 },
    { header: 'Supplier', key: 'supplier', width: 18 },
    { header: 'Price (₹)', key: 'price', width: 12 },
    { header: 'Category', key: 'category', width: 18 }
  ];

  medicines.forEach(m => {
    sheet.addRow({
      name: m.name, genericName: m.genericName, stock: m.stock, batch: m.batchNumber,
      expiry: m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : '', supplier: m.supplier,
      price: m.price, category: m.category
    });
  });

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1565C0' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=medicine_report.xlsx');
  await workbook.xlsx.write(res);
  res.end();
}

// CSV Exports
// SEC-9: CSV cell sanitizer. Doubles embedded double-quotes (RFC 4180) and
// prefixes any leading = + - @ with an apostrophe so Excel/Sheets does not
// interpret the cell as a formula (formula-injection). Returns the quoted
// cell value.
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (s.length > 0 && ['=', '+', '-', '@'].includes(s[0])) {
    s = `'${s}`;
  }
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

function exportAppointmentCSV(res, appointments) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=appointment_report.csv');

  const header = 'Date,Time,Patient,Doctor,Status,Reason,Notes\n';
  const rows = appointments.map(a =>
    [
      csvCell(new Date(a.date).toLocaleDateString()),
      csvCell(a.time),
      csvCell(a.patient?.name || ''),
      csvCell(a.doctor?.name || ''),
      csvCell(a.status),
      csvCell(a.reason || ''),
      csvCell(a.notes || ''),
    ].join(',')
  ).join('\n');

  res.send(header + rows);
}

function exportPatientCSV(res, patients) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=patient_report.csv');

  const header = 'Name,Age,Gender,Phone,Email,Blood Group,Address\n';
  const rows = patients.map(p =>
    [
      csvCell(p.name),
      csvCell(p.age || ''),
      csvCell(p.gender || ''),
      csvCell(p.phone || ''),
      csvCell(p.email || ''),
      csvCell(p.bloodGroup || ''),
      csvCell(p.address || ''),
    ].join(',')
  ).join('\n');

  res.send(header + rows);
}

function exportMedicineCSV(res, medicines) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=medicine_report.csv');

  const header = 'Name,Generic Name,Stock,Batch,Expiry,Supplier,Price,Category\n';
  const rows = medicines.map(m =>
    [
      csvCell(m.name),
      csvCell(m.genericName || ''),
      csvCell(m.stock),
      csvCell(m.batchNumber || ''),
      csvCell(m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : ''),
      csvCell(m.supplier || ''),
      csvCell(m.price),
      csvCell(m.category || ''),
    ].join(',')
  ).join('\n');

  res.send(header + rows);
}
