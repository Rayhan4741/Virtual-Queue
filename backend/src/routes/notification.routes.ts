import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user!.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const unreadCount = await Notification.countDocuments({ userId: req.user!.userId, read: false });
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req: AuthRequest, res, next) => {
  try {
    await Notification.updateMany({ userId: req.user!.userId, read: false }, { $set: { read: true } });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

const pushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
router.post('/subscribe', validateBody(pushSchema), async (req: AuthRequest, res, next) => {
  try {
    await PushSubscription.findOneAndUpdate(
      { endpoint: req.body.endpoint },
      { userId: req.user!.userId, endpoint: req.body.endpoint, keys: req.body.keys },
      { upsert: true, new: true }
    );
    res.status(201).json({ message: 'Push subscription saved' });
  } catch (err) {
    next(err);
  }
});

router.delete('/subscribe', async (req: AuthRequest, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (endpoint) {
      await PushSubscription.deleteOne({ userId: req.user!.userId, endpoint });
    }
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    next(err);
  }
});

export default router;
