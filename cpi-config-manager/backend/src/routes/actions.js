const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getValidToken } = require('../services/tokenService');
const { readJson } = require('../services/dataService');

router.post('/', async (req, res) => {
  const { tenantId, iflowId, actionId } = req.body;
  if (!tenantId || !actionId) return res.status(400).json({ error: 'tenantId and actionId required' });

  try {
    const tenant = readJson('tenants.json').find(t => t.id === tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const settings = readJson('settings.json');
    const action = (settings.customActions || []).find(a => a.id === actionId);
    if (!action) return res.status(404).json({ error: 'Action not found' });

    const token = await getValidToken(tenantId);

    let endpoint = action.apiEndpoint
      .replace(/\{iflowId\}/gi, iflowId || '')
      .replace(/'\{iflowId\}'/gi, `'${iflowId || ''}'`);
    if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;

    const url = `${tenant.host}/api/v1${endpoint}`;

    const response = await axios({
      method: action.method,
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: () => true  // handle all statuses ourselves
    });

    if (response.status >= 400) {
      const msg = response.data?.error?.message || response.data?.message || `HTTP ${response.status}`;
      return res.status(response.status >= 500 ? 502 : 400).json({ error: msg });
    }

    res.json({ success: true, status: response.status, data: response.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
