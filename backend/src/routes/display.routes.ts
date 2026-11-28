import { Router } from 'express';
import { Organization } from '../models/Organization.js';
import { Token } from '../models/Token.js';
import { Announcement } from '../models/Announcement.js';
import { getTodayDateString } from '../services/tokenEngine.js';

const router = Router();

/**
 * Public Display Board endpoint — strictly strips private customer info.
 */
router.get('/:organizationId', async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { serviceId } = req.query;

    const org = await Organization.findById(organizationId).select('name type location workingHours timezone').lean();
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const today = getTodayDateString(org.timezone || 'Asia/Dhaka');

    const tokenFilter: Record<string, unknown> = { organizationId, queueDate: today };
    if (serviceId && typeof serviceId === 'string') {
      tokenFilter.serviceId = serviceId;
    }

    const [servingTokens, calledTokens, announcements, waitingCount] = await Promise.all([
      Token.find({ ...tokenFilter, status: 'SERVING' })
        .select('tokenNumber counterId serviceId servingStartedAt')
        .populate('counterId', 'name counterNumber')
        .populate('serviceId', 'name codePrefix')
        .sort({ servingStartedAt: -1 })
        .lean(),
      Token.find({ ...tokenFilter, status: 'CALLED' })
        .select('tokenNumber counterId serviceId calledAt recallCount')
        .populate('counterId', 'name counterNumber')
        .populate('serviceId', 'name codePrefix')
        .sort({ calledAt: -1 })
        .limit(10)
        .lean(),
      Announcement.find({ organizationId, active: true }).select('message createdAt').sort({ createdAt: -1 }).limit(5).lean(),
      Token.countDocuments({ ...tokenFilter, status: { $in: ['WAITING', 'CHECKED_IN'] } }),
    ]);

    res.json({
      organization: org,
      servingTokens,
      calledTokens,
      announcements,
      waitingCount,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
