import { get, put, post } from './client.js';
import { routePart } from '../lib/contracts.js';

export const getMyAttestations = (cycleId) =>
  get(`/api/attestations?cycleId=${cycleId}`);

export const toggleUsed = (cycleId, clientId, toolId, used) =>
  put(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${routePart(toolId)}/used`, { used });

export const toggleHadAccess = (cycleId, clientId, toolId, hadAccess) =>
  put(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${toolId}/had-access`, { hadAccess });

export const submitAll = (cycleId, remarks = null) =>
  post(`/api/attestations/${routePart(cycleId)}/submit-all`, { remarks });

// Save (or clear) the free-text remark on a single tool's attestation for this cycle.
export const addRemark = (cycleId, clientId, toolId, text) =>
  put(`/api/attestations/${routePart(cycleId)}/${routePart(clientId)}/${routePart(toolId)}/remark`, { text });

// Admin-only: reopen a submitted attestation so the associate can edit it again.
export const reopenAttestation = (cycleId, associateId) =>
  post(`/api/attestations/${routePart(cycleId)}/${routePart(associateId)}/reopen`);
