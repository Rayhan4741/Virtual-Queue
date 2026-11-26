import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../models/Service.js';
import { Organization } from '../models/Organization.js';
import { Token } from '../models/Token.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getServiceEta } from '../services/etaService.js';

const router = Router();

const serviceSchema = z.object({
  organizationId: z.string(),
  name: z.string().trim().min(2).max(120),
  codePrefix: z.string().trim().min(1).max(4).default('A'),
  description: z.string().trim().max(500).optional(),
  avgServiceTimeSec: z.coerce.number().min(30).max(7200).default(300),
  isAvailable: z.boolean().optional().default(true),
  remoteBookingEnabled: z.boolean().optional().default(true),
  monthlyQuota: z.coerce.number().min(0).max(100).optional().default(10),
  maxSnoozes: z.coerce.number().min(0).max(5).optional().default(2),
  snoozeDelayMinutes: z.coerce.number().min(2).max(60).optional().default(10),
  eligibilityRules: z.string().max(500).optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.organizationId) {
      filter.organizationId = req.query.organizationId;
    }
    const services = await Service.find(filter).populate('organizationId', 'name type location').lean();
    res.json({ services });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).populate('organizationId', 'name type location workingHours').lean();
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const [eta, currentServing] = await Promise.all([
      getServiceEta(service._id.toString()),
      Token.findOne({ serviceId: service._id, status: 'SERVING' }).select('tokenNumber').lean(),
    ]);
    res.json({ service, eta, currentServingToken: currentServing?.tokenNumber || null });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireRole('ADMIN'), validateBody(serviceSchema), async (req: AuthRequest, res, next) => {
  try {
    const org = await Organization.findById(req.body.organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    if (org.adminId.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'You do not administer this organization' });
      return;
    }
    const service = await Service.create({
      ...req.body,
      emaServiceTimeSec: req.body.avgServiceTimeSec,
    });
    res.status(201).json({ service });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const org = await Organization.findById(service.organizationId);
    if (!org || org.adminId.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }
    const fields = [
      'name',
      'codePrefix',
      'description',
      'avgServiceTimeSec',
      'isAvailable',
      'remoteBookingEnabled',
      'monthlyQuota',
      'maxSnoozes',
      'snoozeDelayMinutes',
      'priorityPolicy',
      'workingHours',
      'eligibilityRules',
    ] as const;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        (service as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }
    await service.save();
    res.json({ service });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const org = await Organization.findById(service.organizationId);
    if (!org || org.adminId.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }
    service.isAvailable = false;
    await service.save();
    res.json({ message: 'Service deactivated safely', service });
  } catch (err) {
    next(err);
  }
});

export default router;
