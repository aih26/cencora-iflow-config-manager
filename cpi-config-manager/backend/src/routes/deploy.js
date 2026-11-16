const express = require('express');
const router = express.Router();
const { deployIflow, getDeploymentStatus } = require('../services/cpiService');
const { readJson } = require('../services/dataService');

router.post('/', async (req, res) => {
  const { tenantId, iflowIds } = req.body;
  if (!tenantId || !iflowIds?.length) {
    return res.status(400).json({ error: 'tenantId and iflowIds required' });
  }

  const settings = readJson('settings.json');
  const concurrency = settings.concurrency?.threads || 5;
  const results = [];

  for (let i = 0; i < iflowIds.length; i += concurrency) {
    const batch = iflowIds.slice(i, i + concurrency);
    await Promise.all(batch.map(async (iflowId) => {
      try {
        const result = await deployIflow(tenantId, iflowId);
        results.push({ iflowId, status: 'deploying', taskId: result?.TaskId || null });
      } catch (err) {
        results.push({ iflowId, status: 'error', error: err.message });
      }
    }));
  }

  res.json({
    total: iflowIds.length,
    deploying: results.filter(r => r.status === 'deploying').length,
    errors: results.filter(r => r.status === 'error').length,
    results
  });
});

router.get('/status/:taskId', async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  try {
    const status = await getDeploymentStatus(tenantId, req.params.taskId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
