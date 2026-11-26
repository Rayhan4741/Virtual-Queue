import { Router } from 'express';
import { z } from 'zod';
import { Token } from '../models/Token.js';
import { validateBody } from '../middleware/validate.js';
import { issueToken } from '../services/tokenEngine.js';
import { getServiceEta } from '../services/etaService.js';
import { emitQueueEvent } from '../services/socketService.js';

const router = Router();

const kioskTokenSchema = z.object({
  organizationId: z.string(),
  serviceId: z.string(),
  guestName: z.string().trim().max(100).optional(),
  guestPhone: z.string().trim().max(30).optional(),
  source: z.enum(['KIOSK', 'GUEST']).optional().default('KIOSK'),
});

router.post('/tokens', validateBody(kioskTokenSchema), async (req, res, next) => {
  try {
    const token = await issueToken({
      organizationId: req.body.organizationId,
      serviceId: req.body.serviceId,
      source: req.body.source,
      guestName: req.body.guestName,
      guestPhone: req.body.guestPhone,
    });

    const eta = await getServiceEta(token.serviceId.toString(), token.queueOrderScore);

    emitQueueEvent('token:created', [`organization:${token.organizationId}`, `service:${token.serviceId}`], {
      tokenId: token._id,
      tokenNumber: token.tokenNumber,
      status: token.status,
    });
    emitQueueEvent('queue:updated', [`organization:${token.organizationId}`, `service:${token.serviceId}`], {
      serviceId: token.serviceId,
    });

    res.status(201).json({ token, eta });
  } catch (err) {
    next(err);
  }
});

router.get('/track/:trackingCode', async (req, res, next) => {
  try {
    const token = await Token.findOne({ trackingCode: req.params.trackingCode.toUpperCase() })
      .select('tokenNumber status organizationId serviceId counterId queueOrderScore createdAt calledAt')
      .populate('organizationId', 'name location')
      .populate('serviceId', 'name codePrefix')
      .populate('counterId', 'name counterNumber')
      .lean();

    if (!token) {
      res.status(404).json({ error: 'Tracking code not found' });
      return;
    }

    const eta = await getServiceEta(token.serviceId._id.toString(), token.queueOrderScore);
    res.json({ token, eta });
  } catch (err) {
    next(err);
  }
});

export default router;
