import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

// Settings
export const getSettings = () => api.get('/settings');
export const patchApp = (data) => api.patch('/settings/app', data);
export const patchColumns = (cols) => api.patch('/settings/dashboard/columns', cols);
export const patchExportSettings = (data) => api.patch('/settings/export', data);
export const patchImportSettings = (data) => api.patch('/settings/import', data);
export const patchConcurrency = (data) => api.patch('/settings/concurrency', data);
export const getCustomActions = () => api.get('/settings/custom-actions');
export const createCustomAction = (data) => api.post('/settings/custom-actions', data);
export const updateCustomAction = (id, data) => api.put(`/settings/custom-actions/${id}`, data);
export const deleteCustomAction = (id) => api.delete(`/settings/custom-actions/${id}`);
export const getApiConfigs = () => api.get('/settings/api-configs');
export const patchApiConfigs = (data) => api.patch('/settings/api-configs', data);
export const createCustomApi = (data) => api.post('/settings/api-configs/custom', data);
export const updateCustomApi = (id, data) => api.put(`/settings/api-configs/custom/${id}`, data);
export const deleteCustomApi = (id) => api.delete(`/settings/api-configs/custom/${id}`);

// Environments
export const getEnvironments = () => api.get('/environments');
export const createEnvironment = (name) => api.post('/environments', { name });
export const deleteEnvironment = (name) => api.delete(`/environments/${encodeURIComponent(name)}`);
export const reorderEnvironments = (environments) => api.put('/environments/reorder', { environments });

// Tenants
export const getTenants = () => api.get('/tenants');
export const getTenant = (id) => api.get(`/tenants/${id}`);
export const createTenant = (data) => api.post('/tenants', data);
export const updateTenant = (id, data) => api.put(`/tenants/${id}`, data);
export const deleteTenant = (id) => api.delete(`/tenants/${id}`);
export const refreshToken = (id) => api.post(`/tenants/${id}/refresh-token`);
export const getTokenInfo = (id) => api.get(`/tenants/${id}/token-info`);
export const testConnection = (id) => api.post(`/tenants/${id}/test-connection`);

// Packages
export const getPackages = (tenantId) => api.get(`/packages?tenantId=${tenantId}`);

// iFlows
export const getIflows = (tenantId, packageId) => {
  const params = new URLSearchParams({ tenantId });
  if (packageId) params.append('packageId', packageId);
  return api.get(`/iflows?${params}`);
};
export const getRuntimeStatus = (tenantId, iflowIds) =>
  api.post('/iflows/runtime-status', { tenantId, iflowIds });
export const getIflowConfigurations = (tenantId, iflowId) =>
  api.get(`/iflows/${iflowId}/configurations?tenantId=${tenantId}`);

// Export
export const exportConfigs = (data) => api.post('/export', data);
export const getExportFiles = () => api.get('/export/files');
export const getExportInventory = (env) => api.get(`/export/inventory?env=${encodeURIComponent(env)}`);
export const getExportDiff = (tenantId, iflowId, packageId) => {
  const p = new URLSearchParams({ tenantId, iflowId });
  if (packageId) p.append('packageId', packageId);
  return api.get(`/export/diff?${p}`);
};
export const previewExport = (tenantId, iflowId) =>
  api.get(`/export/preview?tenantId=${tenantId}&iflowId=${iflowId}`);

// Import
export const previewImport = (data) => api.post('/import/preview', data);
export const applyImport = (data) => api.post('/import/apply', data);
export const getImportFiles = () => api.get('/import/files');
export const getImportInventory = (env, baseDir) => {
  const p = new URLSearchParams({ env });
  if (baseDir) p.append('baseDir', baseDir);
  return api.get(`/import/inventory?${p}`);
};
export const uploadImportFiles = (env, files) => {
  const form = new FormData();
  form.append('env', env);
  files.forEach(f => form.append('files', f));
  return api.post('/import/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Compare
export const compareEnvs = (data) => api.post('/compare', data);

// Download helpers (direct link — no JSON interceptor needed)
export const exportDownloadUrl = (env) => `/api/export/download?env=${encodeURIComponent(env)}`;

export const clearExportFolder = (env) => api.delete(`/export/folder?env=${encodeURIComponent(env)}`);
export const clearImportFolder = (env) => api.delete(`/import/folder?env=${encodeURIComponent(env)}`);

// Deploy
export const deployIflows = (tenantId, iflowIds) =>
  api.post('/deploy', { tenantId, iflowIds });

// Execute custom action
export const executeAction = (tenantId, iflowId, actionId) =>
  api.post('/execute-action', { tenantId, iflowId, actionId });

export default api;
