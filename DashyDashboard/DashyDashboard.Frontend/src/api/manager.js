import { get, post, put, downloadFile } from './client.js';
import { routePart } from '../lib/contracts.js';

export const getAllUsers = () => get('/api/manager/users');
export const getTeam = (cycleId, { includeEmpty = false } = {}) =>
  get(`/api/manager/team?cycleId=${cycleId}${includeEmpty ? '&includeEmpty=true' : ''}`);
export const getMemberDetail = (memberId, cycleId) =>
  get(`/api/manager/team/${routePart(memberId)}?cycleId=${cycleId}`);

export const getMemberAccess = (memberId) =>
  get(`/api/manager/team/${routePart(memberId)}/access`).then((groups) =>
    (groups ?? []).map((group) => ({
      ...group,
      tools: (group.tools ?? []).map(({ accessFrom, isOpen, ...tool }) => ({
        ...tool,
        givenDate: accessFrom ?? tool.givenDate,
        isOpen: isOpen ?? false,
      })),
    }))
  );

export const grantAccess = (memberId, data) => {
  const { accessFrom, ...rest } = data ?? {};
  return post(`/api/manager/team/${routePart(memberId)}/access`, {
    ...rest,
    givenDate: data?.givenDate ?? accessFrom,
  });
};

export const revokeAccess = (memberId, clientId, toolId) =>
  put(`/api/manager/team/${routePart(memberId)}/access/${routePart(clientId)}/${routePart(toolId)}/revoke`);

// accessTo: 'yyyy-MM-dd' to set an end date, or null to clear it (make open-ended).
export const updateAccessEndDate = (memberId, clientId, toolId, accessTo) =>
  put(`/api/manager/team/${routePart(memberId)}/access/${routePart(clientId)}/${routePart(toolId)}/end-date`, { accessTo });

export const setOpenAccess = (memberId, clientId, toolId, open) =>
  put(`/api/manager/team/${routePart(memberId)}/access/${routePart(clientId)}/${routePart(toolId)}/open`, { open });

// toolUserId: the login the associate uses inside the client's tool (or null to clear it).
export const updateAccessUserId = (memberId, clientId, toolId, toolUserId) =>
  put(`/api/manager/team/${routePart(memberId)}/access/${routePart(clientId)}/${routePart(toolId)}/user-id`, { toolUserId });

// Export the visible accesses as .xlsx. Pass the on-screen filters so the file matches the view.
export const exportAccesses = (cycleId, { memberId = null, clientId = null } = {}) => {
  const params = new URLSearchParams({ cycleId: String(cycleId) });
  if (memberId) params.set('memberId', memberId);
  if (clientId) params.set('clientId', clientId);
  return downloadFile(`/api/manager/access/export?${params.toString()}`, `accesses-cycle${cycleId}.xlsx`);
};

export const getClientsAndTools = () => get('/api/manager/clients-tools');

export const getGrantableClientsAndTools = () => get('/api/manager/grantable-clients-tools');

export const generateNextCycle = () => post('/api/manager/cycles/generate-next');

export const getDisputes = (cycleId) => get(`/api/manager/disputes?cycleId=${cycleId}`);

export const exportDisputes = (cycleId) =>
  downloadFile(`/api/manager/disputes/export?cycleId=${cycleId}`, `access-disputes-cycle${cycleId}.xlsx`);

// ── Screenshot review (Feature 2 §6) ───────────────────────────────────────

// Approve or reject a single member's screenshot for one tool. `reason` is required
// (and shown to the associate) when rejecting; ignored when approving.
export const reviewScreenshot = (cycleId, associateId, clientId, toolId, approve, reason = null) =>
  put(`/api/manager/screenshots/${routePart(cycleId)}/${routePart(associateId)}/${routePart(clientId)}/${routePart(toolId)}/review`, {
    approve, reason,
  });

// Approve every Pending screenshot for a member in one go. Returns { approved: <count> }.
export const approveAllScreenshots = (cycleId, associateId) =>
  put(`/api/manager/screenshots/${routePart(cycleId)}/${routePart(associateId)}/approve-all`);

// Download a .zip of every screenshot uploaded for the cycle (Feature 2 §B5). The server
// authorizes via SuperUserRoles, so this is shared by the manager and admin/GFH dashboards.
export const downloadScreenshotsZip = (cycleId) =>
  downloadFile(`/api/manager/cycles/${routePart(cycleId)}/screenshots.zip`, `screenshots-cycle${cycleId}.zip`);
