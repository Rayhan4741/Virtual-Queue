import crypto from 'crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';

export interface QrCheckInPayload {
  type: 'CHECK_IN';
  organizationId: string;
  serviceId?: string;
  entranceCode?: string;
  exp: number;
  nonce: string;
}

function signData(data: string): string {
  return crypto.createHmac('sha256', env.QR_SIGNING_SECRET).update(data).digest('hex');
}

export function createSignedQrToken(
  organizationId: string,
  options?: { serviceId?: string; entranceCode?: string; ttlSeconds?: number }
): string {
  const payload: QrCheckInPayload = {
    type: 'CHECK_IN',
    organizationId,
    serviceId: options?.serviceId,
    entranceCode: options?.entranceCode,
    exp: Math.floor(Date.now() / 1000) + (options?.ttlSeconds ?? 3600),
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signData(encoded);
  return `${encoded}.${sig}`;
}

export function verifySignedQrToken(qrToken: string): {
  valid: boolean;
  payload?: QrCheckInPayload;
  reason?: string;
} {
  if (!qrToken || !qrToken.includes('.')) {
    return { valid: false, reason: 'Malformed QR token' };
  }

  const parts = qrToken.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'Invalid QR token structure' };
  }

  const [encoded, providedSig] = parts;
  const expectedSig = signData(encoded);

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid QR signature' };
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as QrCheckInPayload;
    if (payload.type !== 'CHECK_IN' || !payload.organizationId) {
      return { valid: false, reason: 'Invalid QR payload' };
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'QR code has expired' };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'Corrupted QR payload' };
  }
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 280, margin: 2 });
}
