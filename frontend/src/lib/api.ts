const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

let accessToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('vq_access_token') : null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('vq_access_token', token);
    else localStorage.removeItem('vq_access_token');
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== 'undefined') {
    accessToken = localStorage.getItem('vq_access_token');
  }
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string[]>;
  constructor(message: string, status: number, code?: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has('Content-Type') && !(rest.body instanceof FormData)) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (!skipAuth && token) {
    reqHeaders.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: reqHeaders,
    credentials: 'include',
  });

  if (res.status === 401 && !skipAuth && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      reqHeaders.set('Authorization', `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: reqHeaders,
        credentials: 'include',
      });
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const errObj = typeof data === 'object' && data !== null ? data : { error: String(data) };
    throw new ApiError(
      errObj.error || `Request failed (${res.status})`,
      res.status,
      errObj.code,
      errObj.details
    );
  }

  return data as T;
}
