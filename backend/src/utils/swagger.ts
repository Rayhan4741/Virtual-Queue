export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Virtual Queue API',
    version: '1.0.0',
    description: 'Real-Time Remote Token & Queue Management Platform REST API',
  },
  servers: [{ url: '/api', description: 'API Base' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/health': { get: { summary: 'Health check (DB, Redis, Instance ID)', responses: { '200': { description: 'Healthy' } } } },
    '/auth/register': { post: { summary: 'Register customer account', responses: { '201': { description: 'Registered' } } } },
    '/auth/login': { post: { summary: 'Login & receive JWT + HttpOnly refresh cookie', responses: { '200': { description: 'Authenticated' } } } },
    '/auth/refresh': { post: { summary: 'Rotate refresh token', responses: { '200': { description: 'Refreshed' } } } },
    '/auth/logout': { post: { summary: 'Logout & revoke refresh token', responses: { '200': { description: 'Logged out' } } } },
    '/organizations': {
      get: { summary: 'Browse/search organizations', responses: { '200': { description: 'Organization list' } } },
      post: { summary: 'Create organization (Admin)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } },
    },
    '/services': {
      get: { summary: 'List services', responses: { '200': { description: 'Service list' } } },
      post: { summary: 'Create service (Admin)', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Created' } } },
    },
    '/tokens': {
      post: { summary: 'Issue remote token', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Token issued' } } },
    },
    '/tokens/my': {
      get: { summary: 'Get authenticated customer tokens', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Tokens' } } },
    },
    '/tokens/{id}/check-in': {
      post: { summary: 'QR Check-In', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Checked in' } } },
    },
    '/tokens/{id}/cancel': {
      post: { summary: 'Cancel token', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Cancelled' } } },
    },
    '/tokens/{id}/snooze': {
      post: { summary: 'Snooze token', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Snoozed' } } },
    },
    '/tokens/{id}/late-pass': {
      post: { summary: 'Use one Late Pass (5 places back)', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Recovered' } } },
    },
    '/staff/queue': { get: { summary: 'Staff counter queue view', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Queue' } } } },
    '/staff/call-next': { post: { summary: 'Call next eligible token', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Called' } } } },
    '/staff/recall': { post: { summary: 'Recall called token', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Recalled' } } } },
    '/staff/start': { post: { summary: 'Start serving token', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Serving' } } } },
    '/staff/complete': { post: { summary: 'Complete serving token', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Completed' } } } },
    '/staff/skip': { post: { summary: 'Skip or mark No-Show', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated' } } } },
    '/staff/transfer': { post: { summary: 'Transfer token to another service', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Transferred' } } } },
    '/admin/dashboard': { get: { summary: 'Admin live overview', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Summary' } } } },
    '/admin/analytics': { get: { summary: 'Admin Recharts analytics', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Analytics' } } } },
    '/admin/audit-logs': { get: { summary: 'Append-only audit logs', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Logs' } } } },
    '/kiosk/tokens': { post: { summary: 'Issue kiosk/guest walk-in token', responses: { '201': { description: 'Token issued' } } } },
    '/display/{organizationId}': { get: { summary: 'Public display board snapshot', responses: { '200': { description: 'Display data' } } } },
  },
};
