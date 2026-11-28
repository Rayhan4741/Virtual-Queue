import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: '../.env' });
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  INSTANCE_ID: z.string().min(1).default('backend-1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default(isProd ? 'info' : 'debug'),
  FRONTEND_URL: z.string().min(1).default('http://localhost:3000'),
  MONGODB_URI: isProd
    ? z.string().min(10, 'MONGODB_URI is required in production')
    : z.string().default('mongodb://127.0.0.1:27017/virtual_queue'),
  MONGODB_SECONDARY_URI: z.string().optional().default(''),
  MONGODB_SECONDARY_2_URI: z.string().optional().default(''),
  ALLOW_URI_FALLBACK: z.string().default('false'),
  USE_IN_MEMORY_DB: z.string().default('false'),
  REDIS_URL: z.string().optional().default(''),
  JWT_ACCESS_SECRET: isProd
    ? z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters in production')
    : z.string().min(16).default('dev-access-secret-key-min-16-chars-vq'),
  JWT_REFRESH_SECRET: isProd
    ? z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters in production')
    : z.string().min(16).default('dev-refresh-secret-key-min-16-chars-vq'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  QR_SIGNING_SECRET: isProd
    ? z.string().min(32, 'QR_SIGNING_SECRET must be at least 32 characters in production')
    : z.string().min(16).default('dev-qr-signing-secret-min-16-chars-vq'),
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@virtualqueue.app'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('noreply@virtualqueue.app'),
  OPENROUTESERVICE_API_KEY: z.string().optional().default(''),
  AI_PROVIDER: z.enum(['mock', 'openai', 'gemini']).default('mock'),
  AI_API_KEY: z.string().optional().default(''),
  // Payment Gateways (Stripe, SSLCommerz, bKash)
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  SSLCOMMERZ_STORE_ID: z.string().optional().default(''),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional().default(''),
  SSLCOMMERZ_IS_SANDBOX: z.string().default('true'),
  BKASH_APP_KEY: z.string().optional().default(''),
  BKASH_APP_SECRET: z.string().optional().default(''),
  BKASH_USERNAME: z.string().optional().default(''),
  BKASH_PASSWORD: z.string().optional().default(''),
  BKASH_IS_SANDBOX: z.string().default('true'),
});

export function validateEnv(rawEnv: NodeJS.ProcessEnv = process.env) {
  const prodMode = rawEnv.NODE_ENV === 'production';
  const schema = prodMode
    ? baseSchema.extend({
        MONGODB_URI: z.string().min(10, 'MONGODB_URI is required in production'),
        JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars in production'),
        JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars in production'),
        QR_SIGNING_SECRET: z.string().min(32, 'QR_SIGNING_SECRET must be >= 32 chars in production'),
      })
    : baseSchema;

  return schema.safeParse(rawEnv);
}

const parsed = validateEnv(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
