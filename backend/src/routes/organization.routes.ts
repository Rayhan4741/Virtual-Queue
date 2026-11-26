import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { Service } from '../models/Service.js';
import { Token } from '../models/Token.js';
import { User } from '../models/User.js';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSignedQrToken, generateQrDataUrl } from '../services/qrService.js';

const router = Router();

const orgSchema = z.object({
  name: z.string().trim().min(2).max(150),
  type: z.enum(['BANK', 'HOSPITAL', 'PUBLIC_OFFICE', 'UNIVERSITY', 'UTILITY', 'OTHER']),
  description: z.string().trim().max(500).optional(),
  location: z.object({
    address: z.string().trim().min(2),
    city: z.string().trim().min(2),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  workingHours: z
    .object({
      open: z.string(),
      close: z.string(),
      days: z.array(z.string()).optional(),
    })
    .optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { q, type } = req.query;
    const filter: Record<string, unknown> = { status: 'ACTIVE' };
    if (type && typeof type === 'string' && type !== 'ALL') {
      filter.type = type;
    }
    if (q && typeof q === 'string' && q.trim()) {
      const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { 'location.city': regex }, { 'location.address': regex }];
    }

    const orgs = await Organization.find(filter).sort({ name: 1 }).lean();
    const enriched = await Promise.all(
      orgs.map(async (org) => {
        const [servicesCount, waitingCount] = await Promise.all([
          Service.countDocuments({ organizationId: org._id, isAvailable: true }),
          Token.countDocuments({ organizationId: org._id, status: { $in: ['WAITING', 'CHECKED_IN'] } }),
        ]);
        return { ...org, servicesCount, waitingCount };
      })
    );
    res.json({ organizations: enriched });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.id).lean();
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    const services = await Service.find({ organizationId: org._id }).lean();
    const servicesWithQueue = await Promise.all(
      services.map(async (svc) => {
        const waitingCount = await Token.countDocuments({
          serviceId: svc._id,
          status: { $in: ['WAITING', 'CHECKED_IN'] },
        });
        return { ...svc, waitingCount };
      })
    );
    res.json({ organization: org, services: servicesWithQueue });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireRole('ADMIN'), validateBody(orgSchema), async (req: AuthRequest, res, next) => {
  try {
    const entranceQrCode = crypto.randomBytes(12).toString('hex');
    const org = await Organization.create({
      ...req.body,
      adminId: req.user!.userId,
      entranceQrCode,
    });
    // Link admin user to this organization if they don't have one yet
    await User.updateOne({ _id: req.user!.userId, organizationId: { $exists: false } }, { $set: { organizationId: org._id } });
    res.status(201).json({ organization: org });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    if (org.adminId.toString() !== req.user!.userId) {
      res.status(403).json({ error: 'You do not own this organization' });
      return;
    }
    const allowedFields = ['name', 'type', 'description', 'location', 'workingHours', 'status'] as const;
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (org as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }
    await org.save();
    res.json({ organization: org });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/entrance-qr', authenticate, requireRole('ADMIN', 'STAFF'), async (req: AuthRequest, res, next) => {
  try {
    const org = await Organization.findById(req.params.id).lean();
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    const signedQr = createSignedQrToken(org._id.toString(), {
      entranceCode: org.entranceQrCode,
      ttlSeconds: 60 * 60 * 12,
    });
    const qrDataUrl = await generateQrDataUrl(signedQr);
    res.json({ qrPayload: signedQr, qrDataUrl, expiresInSeconds: 43200 });
  } catch (err) {
    next(err);
  }
});

export default router;
