import { clearDevSessionUserId, getAuthHeaders } from './auth.js';

const BASE = import.meta.env.VITE_API_URL ?? '';

async function readProblemTitle(res) {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;

  try {
    const payload = await res.json();
    return typeof payload?.title === 'string' ? payload.title : null;
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: getAuthHeaders({
      'Content-Type': 'application/json',
      ...options.headers,
    }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearDevSessionUserId();
    }

    const title = await readProblemTitle(res);
    throw new Error(
      title ||
      {
        400: 'Bad request.',
        401: 'Your sign-in could not be verified. Refresh the page and try again.',
        403: 'Access denied.',
        404: 'Resource not found.',
        429: 'Too many requests. Please slow down.',
        500: 'Server error. Please try again later.',
      }[res.status] ||
      `Request failed (HTTP ${res.status}).`
    );
  }

  if (res.status === 204) return null;
  return res.json();
}

export const get = (path) => request(path);
export const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
export const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
