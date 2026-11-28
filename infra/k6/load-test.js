import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 100 },
    { duration: '20s', target: 500 },
    { duration: '30s', target: 1000 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080/api';

export default function () {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  const orgsRes = http.get(`${BASE_URL}/organizations`);
  check(orgsRes, {
    'organizations status is 200': (r) => r.status === 200,
  });

  if (orgsRes.status === 200) {
    const body = orgsRes.json();
    const orgs = body?.organizations || [];
    if (orgs.length > 0) {
      const orgId = orgs[0]._id;

      const displayRes = http.get(`${BASE_URL}/display/${orgId}`);
      check(displayRes, {
        'display board 200': (r) => r.status === 200,
      });

      const orgDetailRes = http.get(`${BASE_URL}/organizations/${orgId}`);
      const services = orgDetailRes.json()?.services || [];
      if (orgDetailRes.status === 200 && services.length > 0) {
        const svcId = services[0]._id;
        const kioskRes = http.post(
          `${BASE_URL}/kiosk/tokens`,
          JSON.stringify({ organizationId: orgId, serviceId: svcId, guestName: 'k6 Load User', source: 'KIOSK' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
        check(kioskRes, {
          'kiosk token created (201 or 429)': (r) => r.status === 201 || r.status === 429,
        });

        if (kioskRes.status === 201) {
          const trackingCode = kioskRes.json()?.token?.trackingCode;
          if (trackingCode) {
            const trackRes = http.get(`${BASE_URL}/kiosk/track/${trackingCode}`);
            check(trackRes, {
              'track token 200': (r) => r.status === 200,
            });
          }
        }
      }
    }
  }

  sleep(1);
}
