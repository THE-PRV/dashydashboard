import { get, post, put, downloadFile } from './client.js';
import { routePart } from '../lib/contracts.js';

export const getAdminDepartments = (cycleId) =>
  get(`/api/admin/departments?cycleId=${cycleId}`);

export const getDeptManagers = (deptName, cycleId, clientId) =>
  get(`/api/admin/departments/${encodeURIComponent(deptName)}/managers?cycleId=${cycleId}${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ''}`);

export const getManagerTeam = (managerId, cycleId) =>
  get(`/api/admin/managers/${routePart(managerId)}/team?cycleId=${cycleId}`);

export const getManagerMemberDetail = (managerId, memberId, cycleId) =>
  get(`/api/admin/managers/${routePart(managerId)}/team/${routePart(memberId)}?cycleId=${cycleId}`);

export const updateUser = (associateId, body) =>
  put(`/api/admin/users/${routePart(associateId)}`, body);

export const addTool = (clientId, toolName, departmentId, screenshotRequired = false) =>
  post('/api/admin/tools', { clientId, toolName, departmentId, screenshotRequired });

export const addClient = (clientId, clientName) =>
  post('/api/admin/clients', { clientId, clientName });

export const getNonSubmitted = (deptName, cycleId) =>
  get(`/api/admin/departments/${encodeURIComponent(deptName)}/non-submitted?cycleId=${cycleId}`);

export const getDisputes = (deptName, cycleId) =>
  get(`/api/admin/departments/${encodeURIComponent(deptName)}/disputes?cycleId=${cycleId}`);

export const exportNonSubmitted = (deptName, cycleId) =>
  downloadFile(`/api/admin/departments/${encodeURIComponent(deptName)}/non-submitted/export?cycleId=${cycleId}`,
    `not-fully-submitted-${deptName}-cycle${cycleId}.xlsx`);

export const exportDisputes = (deptName, cycleId) =>
  downloadFile(`/api/admin/departments/${encodeURIComponent(deptName)}/disputes/export?cycleId=${cycleId}`,
    `access-disputes-${deptName}-cycle${cycleId}.xlsx`);
