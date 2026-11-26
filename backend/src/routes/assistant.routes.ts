import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { handleAssistantQuery } from '../services/aiAssistantService.js';

const router = Router();

const querySchema = z.object({
  message: z.string().trim().min(1).max(500),
});

router.post('/chat', optionalAuth, validateBody(querySchema), async (req: AuthRequest, res, next) => {
  try {
    const result = await handleAssistantQuery(req.user?.userId, req.body.message);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
