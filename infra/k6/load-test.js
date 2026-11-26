import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 100 },
    { duration: '30s', target: 500 },
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
    }
  }

  sleep(1);
}
