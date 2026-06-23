import { get, put, post, postForm, getBlobUrl } from './client.js';
import { routePart } from '../lib/contracts.js';

export const getMyAttestations = (cycleId) =>
  get(`/api/attestations?cycleId=${cycleId}`);

export const toggleUsed = (cycleId, clientId, toolId, used) =>
  put(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${routePart(toolId)}/used`, { used });

export const toggleHadAccess = (cycleId, clientId, toolId, hadAccess) =>
  put(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${routePart(toolId)}/had-access`, { hadAccess });

export const submitAll = (cycleId, remarks = null) =>
  post(`/api/attestations/${routePart(cycleId)}/submit-all`, { remarks });

// Save (or clear) the free-text remark on a single tool's attestation for this cycle.
export const addRemark = (cycleId, clientId, toolId, text) =>
  put(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${routePart(toolId)}/remark`, { text });

// Admin-only: reopen a submitted attestation so the associate can edit it again.
export const reopenAttestation = (cycleId, associateId) =>
  post(`/api/attestations/${routePart(cycleId)}/${routePart(associateId)}/reopen`);

// ── Screenshots (Feature 2 §A) ─────────────────────────────────────────────

// Upload (or re-upload) the source screenshot for a single attestation row. The server applies
// the production format, quality, resize, and thumbnail settings. Returns { status: 'Pending' }.
export const uploadScreenshot = (cycleId, clientId, toolId, file) => {
  const form = new FormData();
  form.append('file', file, file.name || 'screenshot');
  return postForm(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${routePart(toolId)}/screenshot`, form);
};

// Fetch the full-size screenshot for one row as an object URL (caller must
// URL.revokeObjectURL when done). Returns null if none exists (404).
// `version` (e.g. screenshotUploadedAt) busts the browser cache on re-upload —
// the server stamps it fresh each upload and serves immutable, versioned URLs.
export const getScreenshotUrl = (cycleId, associateId, clientId, toolId, version) =>
  getBlobUrl(`/api/attestations/${routePart(cycleId)}/${routePart(associateId)}/${routePart(clientId)}/${routePart(toolId)}/screenshot${version ? `?v=${encodeURIComponent(version)}` : ''}`);

// Fetch the thumbnail for one row as an object URL (caller must URL.revokeObjectURL when
// done). Returns null if none exists (404). `version` busts the cache on re-upload (see above).
export const getScreenshotThumbUrl = (cycleId, associateId, clientId, toolId, version) =>
  getBlobUrl(`/api/attestations/${routePart(cycleId)}/${routePart(associateId)}/${routePart(clientId)}/${routePart(toolId)}/thumb${version ? `?v=${encodeURIComponent(version)}` : ''}`);
