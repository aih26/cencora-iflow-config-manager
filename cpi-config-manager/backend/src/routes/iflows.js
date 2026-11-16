const express = require('express');
const router = express.Router();
const {
  getAllIflows,
  getIflowsByPackage,
  getRuntimeStatus,
  getConfigurations
} = require('../services/cpiService');
const { readJson } = require('../services/dataService');

router.get('/', async (req, res) => {
  const { tenantId, packageId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  try {
    const settings = readJson('settings.json');
    const concurrency = settings?.concurrency?.threads || 5;
    const iflows = packageId
      ? await getIflowsByPackage(tenantId, packageId)
      : await getAllIflows(tenantId, concurrency);
    res.json(iflows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/runtime-status', async (req, res) => {
  const { tenantId, iflowIds } = req.body;
  if (!tenantId || !iflowIds?.length) {
    return res.status(400).json({ error: 'tenantId and iflowIds required' });
  }
  try {
    const statusMap = await getRuntimeStatus(tenantId, iflowIds);
    res.json(statusMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:iflowId/configurations', async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  try {
    const configs = await getConfigurations(tenantId, req.params.iflowId);
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
