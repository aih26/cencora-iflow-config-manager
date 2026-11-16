const express = require('express');
const router = express.Router();
const { readJson, writeJson } = require('../services/dataService');

router.get('/', (req, res) => {
  res.json(readJson('settings.json'));
});

router.put('/', (req, res) => {
  const current = readJson('settings.json');
  const updated = { ...current, ...req.body };
  writeJson('settings.json', updated);
  res.json(updated);
});

router.patch('/app', (req, res) => {
  const s = readJson('settings.json');
  s.app = { ...s.app, ...req.body };
  writeJson('settings.json', s);
  res.json(s.app);
});

router.patch('/dashboard/columns', (req, res) => {
  const s = readJson('settings.json');
  s.dashboard.columns = req.body;
  writeJson('settings.json', s);
  res.json(s.dashboard.columns);
});

router.patch('/export', (req, res) => {
  const s = readJson('settings.json');
  s.export = { ...s.export, ...req.body };
  writeJson('settings.json', s);
  res.json(s.export);
});

router.patch('/import', (req, res) => {
  const s = readJson('settings.json');
  s.import = { ...s.import, ...req.body };
  writeJson('settings.json', s);
  res.json(s.import);
});

router.patch('/concurrency', (req, res) => {
  const s = readJson('settings.json');
  s.concurrency = { ...s.concurrency, ...req.body };
  writeJson('settings.json', s);
  res.json(s.concurrency);
});

router.get('/custom-actions', (req, res) => {
  const s = readJson('settings.json');
  res.json(s.customActions || []);
});

router.post('/custom-actions', (req, res) => {
  const s = readJson('settings.json');
  const { v4: uuidv4 } = require('uuid');
  const action = { id: uuidv4(), ...req.body };
  s.customActions = [...(s.customActions || []), action];
  writeJson('settings.json', s);
  res.json(action);
});

router.put('/custom-actions/:id', (req, res) => {
  const s = readJson('settings.json');
  const idx = (s.customActions || []).findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  s.customActions[idx] = { ...s.customActions[idx], ...req.body };
  writeJson('settings.json', s);
  res.json(s.customActions[idx]);
});

router.delete('/custom-actions/:id', (req, res) => {
  const s = readJson('settings.json');
  s.customActions = (s.customActions || []).filter(a => a.id !== req.params.id);
  writeJson('settings.json', s);
  res.json({ ok: true });
});

router.get('/api-configs', (req, res) => {
  const s = readJson('settings.json');
  res.json(s.apiConfigs || {});
});

router.patch('/api-configs', (req, res) => {
  const s = readJson('settings.json');
  if (!s.apiConfigs) s.apiConfigs = {};
  // Merge at the key level so a partial update doesn't wipe other endpoints
  for (const [key, val] of Object.entries(req.body)) {
    s.apiConfigs[key] = { ...(s.apiConfigs[key] || {}), ...val };
  }
  writeJson('settings.json', s);
  res.json(s.apiConfigs);
});

router.post('/api-configs/custom', (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const s = readJson('settings.json');
  if (!s.apiConfigs) s.apiConfigs = {};
  const id = `custom_${uuidv4().replace(/-/g, '').slice(0, 10)}`;
  s.apiConfigs[id] = {
    name: req.body.name,
    method: req.body.method || 'GET',
    endpoint: req.body.endpoint || '',
    description: req.body.description || '',
    isCustom: true,
    extraParams: {},
    extraHeaders: {}
  };
  writeJson('settings.json', s);
  res.json({ id, ...s.apiConfigs[id] });
});

router.put('/api-configs/custom/:id', (req, res) => {
  const s = readJson('settings.json');
  const entry = s.apiConfigs?.[req.params.id];
  if (!entry?.isCustom) return res.status(400).json({ error: 'Not a custom API entry' });
  s.apiConfigs[req.params.id] = { ...entry, name: req.body.name, method: req.body.method, endpoint: req.body.endpoint, description: req.body.description };
  writeJson('settings.json', s);
  res.json(s.apiConfigs[req.params.id]);
});

router.delete('/api-configs/custom/:id', (req, res) => {
  const s = readJson('settings.json');
  if (!s.apiConfigs?.[req.params.id]?.isCustom) return res.status(400).json({ error: 'Not a custom API entry' });
  delete s.apiConfigs[req.params.id];
  writeJson('settings.json', s);
  res.json({ ok: true });
});

module.exports = router;
