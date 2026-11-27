import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { User } from '../models/User.js';

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

const mailTransporter =
  env.SMTP_HOST && env.SMTP_USER
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export interface SendNotificationInput {
  userId: string;
  tokenId?: string;
  organizationId?: string;
  type: string;
  title: string;
  message: string;
  dedupeKey?: string;
}

/**
 * Non-blocking modular notification dispatcher (In-App + Web Push + Email).
 */
export async function sendNotification(input: SendNotificationInput): Promise<void> {
  try {
    if (input.dedupeKey) {
      const existing = await Notification.findOne({ dedupeKey: input.dedupeKey }).lean();
      if (existing) return;
    }

    const user = await User.findById(input.userId).lean();
    if (!user) return;

    if (user.notificationPreferences?.inApp !== false) {
      await Notification.create({
        userId: input.userId,
        tokenId: input.tokenId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        message: input.message,
        dedupeKey: input.dedupeKey,
      }).catch(() => {});
    }

    // Web Push (async, non-blocking)
    if (user.notificationPreferences?.webPush !== false && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      const subs = await PushSubscription.find({ userId: input.userId }).lean();
      for (const sub of subs) {
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({ title: input.title, body: input.message, type: input.type, tokenId: input.tokenId })
          )
          .catch(async (err: { statusCode?: number }) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
            }
          });
      }
    }

    // Email (if configured and user has email, with retry)
    if (user.notificationPreferences?.email !== false && mailTransporter && user.email) {
      withRetry(() =>
        mailTransporter.sendMail({
          from: env.SMTP_FROM,
          to: user.email,
          subject: `[Virtual Queue] ${input.title}`,
          text: input.message,
        })
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('[Notification] Dispatch warning:', (err as Error).message);
  }
}
