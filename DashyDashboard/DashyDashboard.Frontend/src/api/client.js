import { clearDevSessionUserId, getAuthHeaders, DEV_LOGIN_ENABLED } from './auth.js';
import { API_BASE } from './base.js';

async function readProblemBody(res) {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function readProblemTitle(res) {
  const payload = await readProblemBody(res);
  return typeof payload?.title === 'string' ? payload.title : null;
}

// Builds an Error from a non-ok response, with the parsed JSON body (if any) attached as
// `.body` so callers can read structured fields like `offendingRows`.
async function buildHttpError(res) {
  const payload = await readProblemBody(res);
  const title = typeof payload?.title === 'string' ? payload.title : null;
  const err = new Error(
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
  if (payload) err.body = payload;
  err.status = res.status;
  return err;
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
    throw await buildHttpError(res);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const get = (path) => request(path);
export const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
export const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

// Multipart POST: caller passes a FormData body. Do NOT set Content-Type — the browser
// sets it (with the multipart boundary) based on the FormData instance.
export async function postForm(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders({}),
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearDevSessionUserId();
    }
    throw await buildHttpError(res);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Fetches a binary resource (e.g. a screenshot/thumbnail) with auth headers attached and
// returns it as an object URL the caller can assign to an <img src> and must revoke when
// no longer needed (URL.revokeObjectURL).
export async function getBlobUrl(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: getAuthHeaders({}),
  });

  if (!res.ok) {
    if (res.status === 401) clearDevSessionUserId();
    if (res.status === 404) return null;
    const title = await readProblemTitle(res);
    throw new Error(title || `Request failed (HTTP ${res.status}).`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

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
