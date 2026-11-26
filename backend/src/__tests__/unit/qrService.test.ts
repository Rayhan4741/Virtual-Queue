import { describe, it, expect } from 'vitest';
import { createSignedQrToken, verifySignedQrToken } from '../../services/qrService.js';

describe('QR Verification Service', () => {
  it('verifies a valid signed QR payload', () => {
    const qr = createSignedQrToken('org-123', { ttlSeconds: 600 });
    const res = verifySignedQrToken(qr);
    expect(res.valid).toBe(true);
    expect(res.payload?.organizationId).toBe('org-123');
  });

  it('rejects tampered QR payloads', () => {
    const qr = createSignedQrToken('org-123', { ttlSeconds: 600 });
    const [encoded, sig] = qr.split('.');
    const tampered = `${encoded}.${sig.slice(0, -2)}00`;
    expect(verifySignedQrToken(tampered).valid).toBe(false);
  });

  it('rejects expired QR payloads', () => {
    const qr = createSignedQrToken('org-123', { ttlSeconds: -10 });
    const res = verifySignedQrToken(qr);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('expired');
  });
});
