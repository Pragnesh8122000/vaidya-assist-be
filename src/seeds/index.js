const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db');
const Permission = require('../models/Permission');
const Role = require('../models/Role');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Medicine = require('../models/Medicine');

const permissions = [
  { name: 'Manage Appointments', slug: 'manage_appointments', module: 'appointments', description: 'Create, update, delete appointments' },
  { name: 'View Appointments', slug: 'view_appointments', module: 'appointments', description: 'View appointments' },
  { name: 'Manage Patients', slug: 'manage_patients', module: 'patients', description: 'Create, update, delete patients' },
  { name: 'View Patients', slug: 'view_patients', module: 'patients', description: 'View patients' },
  { name: 'Manage Medicines', slug: 'manage_medicines', module: 'medicines', description: 'Create, update, delete medicines' },
  { name: 'View Medicines', slug: 'view_medicines', module: 'medicines', description: 'View medicines' },
  { name: 'Upload Files', slug: 'upload_files', module: 'files', description: 'Upload and manage files' },
  { name: 'View Files', slug: 'view_files', module: 'files', description: 'View and download files' },
  { name: 'Generate Reports', slug: 'generate_reports', module: 'reports', description: 'Generate and export reports' },
  { name: 'Manage Assistants', slug: 'manage_assistants', module: 'users', description: 'Create and manage assistants' },
  { name: 'Manage Roles', slug: 'manage_roles', module: 'roles', description: 'Create and manage roles and permissions' },
  { name: 'View Dashboard', slug: 'view_dashboard', module: 'dashboard', description: 'View dashboard analytics' },
  { name: 'Manage Chat', slug: 'manage_chat', module: 'chat', description: 'Use internal chat system' }
];

const roleDefinitions = [
  {
    name: 'Doctor',
    slug: 'doctor',
    description: 'Super Admin - Full access to all features',
    permissionSlugs: permissions.map(p => p.slug)
  },
  {
    name: 'Assistant',
    slug: 'assistant',
    description: 'Doctor assistant with broad access',
    permissionSlugs: ['manage_appointments', 'view_appointments', 'manage_patients', 'view_patients', 'view_medicines', 'upload_files', 'view_files', 'view_dashboard', 'manage_chat']
  },
  {
    name: 'Receptionist',
    slug: 'receptionist',
    description: 'Front desk - manages appointments and patients',
    permissionSlugs: ['manage_appointments', 'view_appointments', 'manage_patients', 'view_patients', 'view_dashboard', 'manage_chat']
  },
  {
    name: 'Pharmacist',
    slug: 'pharmacist',
    description: 'Manages medicine inventory',
    permissionSlugs: ['manage_medicines', 'view_medicines', 'view_patients', 'view_dashboard', 'manage_chat']
  }
];

const seed = async () => {
  try {
    await connectDB();
    console.log('🌱 Starting seed...\n');

    // Clear existing data
    await Promise.all([
      Permission.deleteMany({}),
      Role.deleteMany({}),
      User.deleteMany({}),
      Patient.deleteMany({}),
      Appointment.deleteMany({}),
      Medicine.deleteMany({})
    ]);
    console.log('✅ Cleared existing data');

    // Create permissions
    const createdPermissions = await Permission.insertMany(permissions);
    console.log(`✅ Created ${createdPermissions.length} permissions`);

    // Create roles with permissions
    const permissionMap = {};
    createdPermissions.forEach(p => { permissionMap[p.slug] = p._id; });

    const roles = [];
    for (const roleDef of roleDefinitions) {
      const role = await Role.create({
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        permissions: roleDef.permissionSlugs.map(slug => permissionMap[slug])
      });
      roles.push(role);
    }
    console.log(`✅ Created ${roles.length} roles`);

    const doctorRole = roles.find(r => r.slug === 'doctor');
    const assistantRole = roles.find(r => r.slug === 'assistant');
    const receptionistRole = roles.find(r => r.slug === 'receptionist');
    const pharmacistRole = roles.find(r => r.slug === 'pharmacist');

    // Create users
    const doctor = await User.create({
      name: 'Dr. Rajesh Sharma',
      email: 'doctor@vaidya.com',
      password: 'Password@123',
      phone: '+91-9876543210',
      role: doctorRole._id
    });

    const assistant = await User.create({
      name: 'Priya Patel',
      email: 'assistant@vaidya.com',
      password: 'Password@123',
      phone: '+91-9876543211',
      role: assistantRole._id,
      createdBy: doctor._id
    });

    const receptionist = await User.create({
      name: 'Anita Gupta',
      email: 'receptionist@vaidya.com',
      password: 'Password@123',
      phone: '+91-9876543212',
      role: receptionistRole._id,
      createdBy: doctor._id
    });

    const pharmacist = await User.create({
      name: 'Suresh Kumar',
      email: 'pharmacist@vaidya.com',
      password: 'Password@123',
      phone: '+91-9876543213',
      role: pharmacistRole._id,
      createdBy: doctor._id
    });

    console.log('✅ Created 4 users (doctor, assistant, receptionist, pharmacist)');

    // Create patients
    const patients = await Patient.insertMany([
      { name: 'Amit Verma', age: 35, gender: 'Male', phone: '+91-9001234567', email: 'amit@email.com', address: 'Mumbai, Maharashtra', bloodGroup: 'O+', medicalNotes: [{ note: 'Type 2 Diabetes - on Metformin', createdBy: doctor._id }], createdBy: doctor._id },
      { name: 'Sunita Devi', age: 42, gender: 'Female', phone: '+91-9001234568', email: 'sunita@email.com', address: 'Delhi', bloodGroup: 'A+', medicalNotes: [{ note: 'Hypertension - regular follow-up', createdBy: doctor._id }], createdBy: doctor._id },
      { name: 'Rahul Singh', age: 28, gender: 'Male', phone: '+91-9001234569', email: 'rahul@email.com', address: 'Pune, Maharashtra', bloodGroup: 'B+', createdBy: doctor._id },
      { name: 'Meena Kumari', age: 55, gender: 'Female', phone: '+91-9001234570', email: 'meena@email.com', address: 'Jaipur, Rajasthan', bloodGroup: 'AB+', medicalNotes: [{ note: 'Arthritis - joint pain management', createdBy: doctor._id }], createdBy: doctor._id },
      { name: 'Vikram Patel', age: 45, gender: 'Male', phone: '+91-9001234571', email: 'vikram@email.com', address: 'Ahmedabad, Gujarat', bloodGroup: 'O-', createdBy: doctor._id },
      { name: 'Kavita Sharma', age: 32, gender: 'Female', phone: '+91-9001234572', email: 'kavita@email.com', address: 'Bangalore, Karnataka', bloodGroup: 'A-', createdBy: doctor._id },
      { name: 'Deepak Joshi', age: 60, gender: 'Male', phone: '+91-9001234573', email: 'deepak@email.com', address: 'Lucknow, UP', bloodGroup: 'B-', medicalNotes: [{ note: 'COPD - uses inhaler', createdBy: doctor._id }], createdBy: doctor._id },
      { name: 'Anjali Nair', age: 25, gender: 'Female', phone: '+91-9001234574', email: 'anjali@email.com', address: 'Chennai, Tamil Nadu', bloodGroup: 'O+', createdBy: doctor._id }
    ]);
    console.log(`✅ Created ${patients.length} patients`);

    // Create appointments
    const today = new Date();
    const appointments = await Appointment.insertMany([
      { patient: patients[0]._id, doctor: doctor._id, date: today, time: '09:00', status: 'Completed', reason: 'Diabetes follow-up', notes: 'Blood sugar levels improved', createdBy: doctor._id },
      { patient: patients[1]._id, doctor: doctor._id, date: today, time: '09:30', status: 'Completed', reason: 'BP checkup', createdBy: assistant._id },
      { patient: patients[2]._id, doctor: doctor._id, date: today, time: '10:00', status: 'In Consultation', reason: 'General checkup', createdBy: receptionist._id },
      { patient: patients[3]._id, doctor: doctor._id, date: today, time: '10:30', status: 'Waiting', reason: 'Joint pain', createdBy: receptionist._id },
      { patient: patients[4]._id, doctor: doctor._id, date: today, time: '11:00', status: 'Waiting', reason: 'Fever', createdBy: assistant._id },
      { patient: patients[5]._id, doctor: doctor._id, date: new Date(today.getTime() + 86400000), time: '09:00', status: 'Waiting', reason: 'Skin allergy', createdBy: doctor._id },
      { patient: patients[6]._id, doctor: doctor._id, date: new Date(today.getTime() + 86400000), time: '09:30', status: 'Waiting', reason: 'Breathing difficulty', createdBy: doctor._id },
      { patient: patients[7]._id, doctor: doctor._id, date: new Date(today.getTime() + 172800000), time: '10:00', status: 'Waiting', reason: 'Routine checkup', createdBy: doctor._id },
      { patient: patients[0]._id, doctor: doctor._id, date: new Date(today.getTime() - 86400000), time: '09:00', status: 'Completed', reason: 'Follow-up', createdBy: doctor._id },
      { patient: patients[1]._id, doctor: doctor._id, date: new Date(today.getTime() - 172800000), time: '10:00', status: 'Completed', reason: 'BP monitoring', createdBy: doctor._id },
      { patient: patients[3]._id, doctor: doctor._id, date: new Date(today.getTime() - 259200000), time: '11:00', status: 'Cancelled', reason: 'Follow-up', createdBy: doctor._id }
    ]);
    console.log(`✅ Created ${appointments.length} appointments`);

    // Create medicines
    const medicines = await Medicine.insertMany([
      { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', stock: 200, batchNumber: 'PCM-2024-001', expiryDate: new Date('2026-12-31'), supplier: 'Sun Pharma', price: 2.5, category: 'Analgesic', createdBy: doctor._id },
      { name: 'Amoxicillin 250mg', genericName: 'Amoxicillin', stock: 150, batchNumber: 'AMX-2024-001', expiryDate: new Date('2026-06-30'), supplier: 'Cipla', price: 8, category: 'Antibiotic', createdBy: doctor._id },
      { name: 'Metformin 500mg', genericName: 'Metformin HCL', stock: 300, batchNumber: 'MET-2024-001', expiryDate: new Date('2027-03-31'), supplier: 'Dr. Reddy\'s', price: 3, category: 'Anti-diabetic', createdBy: doctor._id },
      { name: 'Amlodipine 5mg', genericName: 'Amlodipine', stock: 8, batchNumber: 'AML-2024-001', expiryDate: new Date('2026-09-30'), supplier: 'Lupin', price: 5, category: 'Antihypertensive', lowStockThreshold: 10, createdBy: doctor._id },
      { name: 'Omeprazole 20mg', genericName: 'Omeprazole', stock: 100, batchNumber: 'OMP-2024-001', expiryDate: new Date('2026-08-31'), supplier: 'Zydus', price: 4, category: 'Antacid', createdBy: doctor._id },
      { name: 'Cetirizine 10mg', genericName: 'Cetirizine', stock: 5, batchNumber: 'CTZ-2024-001', expiryDate: new Date('2026-05-31'), supplier: 'Mankind', price: 2, category: 'Antihistamine', lowStockThreshold: 10, createdBy: doctor._id },
      { name: 'Azithromycin 500mg', genericName: 'Azithromycin', stock: 75, batchNumber: 'AZT-2024-001', expiryDate: new Date('2026-11-30'), supplier: 'Alkem', price: 15, category: 'Antibiotic', createdBy: doctor._id },
      { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', stock: 180, batchNumber: 'IBU-2024-001', expiryDate: new Date('2026-10-31'), supplier: 'Sun Pharma', price: 3.5, category: 'NSAID', createdBy: doctor._id },
      { name: 'Salbutamol Inhaler', genericName: 'Salbutamol', stock: 3, batchNumber: 'SAL-2024-001', expiryDate: new Date('2026-04-15'), supplier: 'Cipla', price: 120, category: 'Bronchodilator', lowStockThreshold: 5, createdBy: doctor._id },
      { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', stock: 90, batchNumber: 'PAN-2024-001', expiryDate: new Date('2027-01-31'), supplier: 'Torrent', price: 6, category: 'PPI', createdBy: doctor._id }
    ]);
    console.log(`✅ Created ${medicines.length} medicines`);

    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('  Doctor:       doctor@vaidya.com / Password@123');
    console.log('  Assistant:    assistant@vaidya.com / Password@123');
    console.log('  Receptionist: receptionist@vaidya.com / Password@123');
    console.log('  Pharmacist:   pharmacist@vaidya.com / Password@123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

seed();
