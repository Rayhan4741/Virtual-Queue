import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from './models/User.js';
import { Organization } from './models/Organization.js';
import { Service } from './models/Service.js';
import { Counter } from './models/Counter.js';

export async function seedIfEmpty(): Promise<void> {
  const orgCount = await Organization.countDocuments();
  if (orgCount > 0) return;

  console.log('[Seed] Initializing starter organizations, services, counters, and accounts...');
  const passwordHash = await bcrypt.hash('DemoPass123!', 10);

  const admin = await User.create({
    name: 'Dr. Sarah Rahman',
    phone: '01700000001',
    email: 'admin@virtualqueue.app',
    passwordHash,
    role: 'ADMIN',
  });

  const customer = await User.create({
    name: 'Arefin Hasan',
    phone: '01700000002',
    email: 'customer@virtualqueue.app',
    passwordHash,
    role: 'CUSTOMER',
  });

  const bank = await Organization.create({
    name: 'Metro National Bank — Main Branch',
    type: 'BANK',
    description: 'Full-service retail and corporate banking branch with priority and general service counters.',
    location: { address: '42 Financial Avenue, Motijheel', city: 'Dhaka', lat: 23.733, lng: 90.417 },
    workingHours: { open: '09:00', close: '16:30', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] },
    adminId: admin._id,
    entranceQrCode: crypto.randomBytes(12).toString('hex'),
  });

  admin.organizationId = bank._id;
  await admin.save();

  const staff = await User.create({
    name: 'Karim Uddin (Teller)',
    phone: '01700000003',
    email: 'staff@virtualqueue.app',
    passwordHash,
    role: 'STAFF',
    organizationId: bank._id,
  });

  const bankSvc1 = await Service.create({
    organizationId: bank._id,
    name: 'Account & Cash Deposit',
    codePrefix: 'A',
    description: 'Cash deposits, withdrawals, and account updates.',
    avgServiceTimeSec: 240,
    emaServiceTimeSec: 240,
    monthlyQuota: 3,
  });

  const bankSvc2 = await Service.create({
    organizationId: bank._id,
    name: 'Loan & Remittance Desk',
    codePrefix: 'L',
    description: 'Personal loans, SME financing, and international remittance.',
    avgServiceTimeSec: 480,
    emaServiceTimeSec: 480,
    monthlyQuota: 8,
  });

  await Counter.create({
    organizationId: bank._id,
    name: 'Counter 1',
    counterNumber: 1,
    assignedServices: [bankSvc1._id, bankSvc2._id],
    assignedStaff: staff._id,
    status: 'ACTIVE',
  });

  const hospital = await Organization.create({
    name: 'City General Hospital — OPD',
    type: 'HOSPITAL',
    description: 'Outpatient consultation, diagnostics check-in, and pharmacy queue.',
    location: { address: '18 Medical Road, Dhanmondi', city: 'Dhaka', lat: 23.746, lng: 90.376 },
    workingHours: { open: '08:00', close: '20:00', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat'] },
    adminId: admin._id,
    entranceQrCode: crypto.randomBytes(12).toString('hex'),
  });

  const hospSvc = await Service.create({
    organizationId: hospital._id,
    name: 'General Medicine OPD',
    codePrefix: 'M',
    description: 'Primary outpatient physician consultation.',
    avgServiceTimeSec: 360,
    emaServiceTimeSec: 360,
    monthlyQuota: 12,
  });

  await Counter.create({
    organizationId: hospital._id,
    name: 'OPD Room 1',
    counterNumber: 1,
    assignedServices: [hospSvc._id],
    status: 'ACTIVE',
  });

  const pubOffice = await Organization.create({
    name: 'Civic Passport & Citizen Center',
    type: 'PUBLIC_OFFICE',
    description: 'Biometric enrollment, document verification, and citizen inquiries.',
    location: { address: '7 Civic Plaza, Agargaon', city: 'Dhaka', lat: 23.777, lng: 90.38 },
    workingHours: { open: '09:00', close: '17:00', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] },
    adminId: admin._id,
    entranceQrCode: crypto.randomBytes(12).toString('hex'),
  });

  const pubSvc = await Service.create({
    organizationId: pubOffice._id,
    name: 'Document Verification',
    codePrefix: 'P',
    description: 'Application submission and identity document verification.',
    avgServiceTimeSec: 300,
    emaServiceTimeSec: 300,
    monthlyQuota: 10,
  });

  await Counter.create({
    organizationId: pubOffice._id,
    name: 'Desk 1',
    counterNumber: 1,
    assignedServices: [pubSvc._id],
    status: 'ACTIVE',
  });

  console.log(`[Seed] Done. Demo Customer: ${customer.phone} | Staff: ${staff.phone} | Admin: ${admin.phone} (Pass: DemoPass123!)`);
}
