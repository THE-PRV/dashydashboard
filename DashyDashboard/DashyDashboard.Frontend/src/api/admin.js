import { get, post } from './client.js';

export const getAdminDepartments = (cycleId) =>
  get(`/api/admin/departments?cycleId=${cycleId}`);

export const getDeptManagers = (deptName, cycleId, clientId) =>
  get(`/api/admin/departments/${encodeURIComponent(deptName)}/managers?cycleId=${cycleId}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ''}`);

export const addTool = (clientId, toolName, departmentId) =>
  post('/api/admin/tools', { clientId, toolName, departmentId });
