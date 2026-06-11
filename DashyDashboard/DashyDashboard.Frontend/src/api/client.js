import { clearDevSessionUserId, getAuthHeaders, DEV_LOGIN_ENABLED } from './auth.js';
import { API_BASE } from './base.js';

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
  const res = await fetch(`${API_BASE}${path}`, {
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
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const get = (path) => request(path);
export const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
export const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

export async function downloadFile(path, fallbackName) {
  if (!DEV_LOGIN_ENABLED) {
    const a = document.createElement('a');
    a.href = `${API_BASE}${path}`;
    a.download = fallbackName || '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: getAuthHeaders({}),
  });
  if (!res.ok) {
    if (res.status === 401) clearDevSessionUserId();
    const title = await readProblemTitle(res);
    throw new Error(title || `Export failed (HTTP ${res.status}).`);
  }
  let name = fallbackName;
  const cd = res.headers.get('content-disposition');
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)/i.exec(cd);
    if (m) { try { name = decodeURIComponent(m[1]); } catch { name = m[1]; } }
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
