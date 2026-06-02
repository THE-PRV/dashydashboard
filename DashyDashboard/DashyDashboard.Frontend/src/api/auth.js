import { asAssociateId } from '../lib/contracts.js';

const BASE = import.meta.env.VITE_API_URL ?? '';
const DEV_SESSION_KEY = 'dashy.devUserId';
const DEV_LOGIN_ENABLED = import.meta.env.DEV;

function readDevUserId() {
  if (!DEV_LOGIN_ENABLED) return null;
  return window.sessionStorage.getItem(DEV_SESSION_KEY);
}

export function setDevSessionUserId(associateId) {
  if (!DEV_LOGIN_ENABLED) return;
  window.sessionStorage.setItem(DEV_SESSION_KEY, asAssociateId(associateId));
}

export function clearDevSessionUserId() {
  window.sessionStorage.removeItem(DEV_SESSION_KEY);
}

export function getAuthHeaders(extraHeaders = {}) {
  const devUserId = readDevUserId();
  return {
    ...(devUserId ? { 'X-User-Id': devUserId } : {}),
    ...extraHeaders,
  };
}

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

export async function getCurrentUser() {
  const res = await fetch(`${BASE}/api/auth/me`, {
    credentials: 'include',
    headers: getAuthHeaders(),
  });

  if (res.status === 401) {
    clearDevSessionUserId();
    return null;
  }

  if (!res.ok) {
    const title = await readProblemTitle(res);
    throw new Error(
      title ||
      {
        403: 'You do not have access to this dashboard.',
        404: 'Sign-in is not available right now.',
        500: 'Could not verify your sign-in right now.',
      }[res.status] ||
      `Could not verify your sign-in (HTTP ${res.status}).`
    );
  }

  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const title = await readProblemTitle(res);
    throw new Error(
      title ||
      {
        401: 'Invalid username or password.',
        404: 'Password sign-in is not available here.',
      }[res.status] ||
      'Sign-in failed. Please try again.'
    );
  }

  return res.json();
}

export { DEV_LOGIN_ENABLED };
