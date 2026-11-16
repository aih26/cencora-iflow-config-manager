const express = require('express');
const router = express.Router();
const { getPackages } = require('../services/cpiService');

router.get('/', async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  try {
    const packages = await getPackages(tenantId);
    res.json(packages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
