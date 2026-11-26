import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { Counter } from '../models/Counter.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { Token } from '../models/Token.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getAdminDashboardSummary, getAdminAnalytics } from '../services/analyticsService.js';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

async function resolveAdminOrgId(req: AuthRequest): Promise<string | null> {
  const requestedOrgId = (req.query.organizationId as string) || (req.body?.organizationId as string);
  if (requestedOrgId) {
    const owned = await Organization.findOne({ _id: requestedOrgId, adminId: req.user!.userId }).lean();
    return owned ? owned._id.toString() : null;
  }
  const org = await Organization.findOne({ adminId: req.user!.userId }).lean();
  return org ? org._id.toString() : null;
}

router.get('/my-organizations', async (req: AuthRequest, res, next) => {
  try {
    const orgs = await Organization.find({ adminId: req.user!.userId }).lean();
    res.json({ organizations: orgs });
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard', async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.json({ summary: null, activeQueue: [] });
      return;
    }
    const [summary, activeQueue] = await Promise.all([
      getAdminDashboardSummary(orgId),
      Token.find({ organizationId: orgId, status: { $in: ['WAITING', 'CHECKED_IN', 'CALLED', 'SERVING'] } })
        .populate('serviceId', 'name codePrefix')
        .populate('counterId', 'name counterNumber')
        .sort({ queueOrderScore: 1 })
        .limit(100)
        .lean(),
    ]);
    res.json({ organizationId: orgId, summary, activeQueue });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.status(404).json({ error: 'No organization found for this admin' });
      return;
    }
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const analytics = await getAdminAnalytics(orgId, days);
    res.json({ analytics });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.json({ logs: [] });
      return;
    }
    const logs = await AuditLog.find({ organizationId: orgId })
      .populate('actorId', 'name role phone')
      .populate('tokenId', 'tokenNumber')
      .populate('counterId', 'name counterNumber')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

router.get('/counters', async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.json({ counters: [] });
      return;
    }
    const counters = await Counter.find({ organizationId: orgId })
      .populate('assignedServices', 'name codePrefix')
      .populate('assignedStaff', 'name phone status')
      .sort({ counterNumber: 1 })
      .lean();
    res.json({ counters });
  } catch (err) {
    next(err);
  }
});

const counterSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  counterNumber: z.coerce.number().int().min(1),
  assignedServices: z.array(z.string()).default([]),
  assignedStaff: z.string().optional().nullable(),
});
router.post('/counters', validateBody(counterSchema), async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.status(403).json({ error: 'No owned organization found' });
      return;
    }
    const counter = await Counter.create({
      organizationId: orgId,
      name: req.body.name,
      counterNumber: req.body.counterNumber,
      assignedServices: req.body.assignedServices,
      assignedStaff: req.body.assignedStaff || undefined,
    });
    res.status(201).json({ counter });
  } catch (err) {
    next(err);
  }
});

router.patch('/counters/:id', async (req: AuthRequest, res, next) => {
  try {
    const counter = await Counter.findById(req.params.id);
    if (!counter) {
      res.status(404).json({ error: 'Counter not found' });
      return;
    }
    const org = await Organization.findOne({ _id: counter.organizationId, adminId: req.user!.userId });
    if (!org) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }
    const allowed = ['name', 'counterNumber', 'assignedServices', 'assignedStaff', 'status'] as const;
    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        (counter as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }
    await counter.save();
    res.json({ counter });
  } catch (err) {
    next(err);
  }
});

router.get('/staff', async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.json({ staff: [] });
      return;
    }
    const staff = await User.find({ organizationId: orgId, role: 'STAFF' })
      .select('-passwordHash -resetTokenHash')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ staff });
  } catch (err) {
    next(err);
  }
});

const createStaffSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6).max(100),
});
router.post('/staff', validateBody(createStaffSchema), async (req: AuthRequest, res, next) => {
  try {
    const orgId = await resolveAdminOrgId(req);
    if (!orgId) {
      res.status(403).json({ error: 'No owned organization found' });
      return;
    }
    const existing = await User.findOne({ phone: req.body.phone }).lean();
    if (existing) {
      res.status(409).json({ error: 'Phone number already in use' });
      return;
    }
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const staff = await User.create({
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email || undefined,
      passwordHash,
      role: 'STAFF',
      organizationId: orgId,
    });
    res.status(201).json({
      staff: { id: staff._id, name: staff.name, phone: staff.phone, email: staff.email, role: staff.role, status: staff.status },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/staff/:id', async (req: AuthRequest, res, next) => {
  try {
    const staff = await User.findById(req.params.id);
    if (!staff || staff.role !== 'STAFF') {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    const org = await Organization.findOne({ _id: staff.organizationId, adminId: req.user!.userId });
    if (!org) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }
    if (req.body.status) staff.status = req.body.status;
    if (req.body.name) staff.name = req.body.name;
    await staff.save();
    res.json({ staff: { id: staff._id, name: staff.name, phone: staff.phone, status: staff.status } });
  } catch (err) {
    next(err);
  }
});

export default router;
