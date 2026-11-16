const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readJson, writeJson } = require('../services/dataService');
const { fetchToken, getTokenInfo } = require('../services/tokenService');

router.get('/', (req, res) => {
  const tenants = readJson('tenants.json');
  const safe = tenants.map(t => ({
    ...t,
    auth: {
      ...t.auth,
      clientSecret: '***',
      token: t.auth.token ? {
        ...t.auth.token,
        access_token: t.auth.token.access_token
          ? `${t.auth.token.access_token.substring(0, 20)}...`
          : null
      } : null
    }
  }));
  res.json(safe);
});

router.get('/:id', (req, res) => {
  const tenants = readJson('tenants.json');
  const t = tenants.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tenant not found' });
  res.json({
    ...t,
    auth: { ...t.auth, clientSecret: '***' }
  });
});

router.post('/', (req, res) => {
  const tenants = readJson('tenants.json');
  const tenant = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...req.body,
    auth: {
      ...req.body.auth,
      token: null,
      lastRefreshed: null
    }
  };
  tenants.push(tenant);
  writeJson('tenants.json', tenants);
  res.json({ ...tenant, auth: { ...tenant.auth, clientSecret: '***' } });
});

router.put('/:id', (req, res) => {
  const tenants = readJson('tenants.json');
  const idx = tenants.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tenant not found' });

  const existing = tenants[idx];
  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    auth: {
      ...existing.auth,
      ...req.body.auth,
      clientSecret: req.body.auth?.clientSecret && req.body.auth.clientSecret !== '***'
        ? req.body.auth.clientSecret
        : existing.auth.clientSecret,
      token: existing.auth.token
    }
  };
  tenants[idx] = updated;
  writeJson('tenants.json', tenants);
  res.json({ ...updated, auth: { ...updated.auth, clientSecret: '***' } });
});

router.delete('/:id', (req, res) => {
  const tenants = readJson('tenants.json');
  const filtered = tenants.filter(t => t.id !== req.params.id);
  writeJson('tenants.json', filtered);
  res.json({ ok: true });
});

router.post('/:id/refresh-token', async (req, res) => {
  try {
    const tenants = readJson('tenants.json');
    const tenant = tenants.find(t => t.id === req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const token = await fetchToken(tenant);
    res.json({
      access_token: `${token.access_token.substring(0, 40)}...`,
      expires_in: token.expires_in,
      token_type: token.token_type,
      fetched_at: new Date(token.fetched_at).toISOString(),
      expires_at: new Date(token.fetched_at + token.expires_in * 1000).toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/token-info', (req, res) => {
  const info = getTokenInfo(req.params.id);
  if (!info) return res.json({ hasToken: false });
  res.json({ hasToken: true, ...info });
});

router.post('/:id/test-connection', async (req, res) => {
  try {
    const { getPackages } = require('../services/cpiService');
    const packages = await getPackages(req.params.id);
    res.json({ ok: true, packageCount: packages.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
