import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../config/env.js';

describe('Environment Validation (Zod)', () => {
  it('fails fast in production when mandatory secrets or MONGODB_URI are missing', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      PORT: '5000',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.JWT_ACCESS_SECRET).toBeDefined();
      expect(fields.JWT_REFRESH_SECRET).toBeDefined();
      expect(fields.QR_SIGNING_SECRET).toBeDefined();
    }
  });

  it('succeeds in production when all mandatory secrets and URLs are provided', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      PORT: '5000',
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/virtual_queue',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      QR_SIGNING_SECRET: 'c'.repeat(48),
      FRONTEND_URL: 'https://virtualqueue.vercel.app',
    });
    expect(result.success).toBe(true);
  });
});
