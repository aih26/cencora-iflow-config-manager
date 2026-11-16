const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { readJson, writeJson, dataDir } = require('../services/dataService');

router.get('/', (req, res) => {
  res.json(readJson('environments.json'));
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const envs = readJson('environments.json');
  if (envs.includes(name)) return res.status(409).json({ error: 'Environment already exists' });
  envs.push(name);
  writeJson('environments.json', envs);

  // Create export and import subdirectories for the new environment
  const settings = readJson('settings.json');
  const exportDir = path.join(dataDir, settings.export?.baseDir || 'exports', name);
  const importDir = path.join(dataDir, settings.import?.baseDir || 'imports', name);
  fs.mkdirSync(exportDir, { recursive: true });
  fs.mkdirSync(importDir, { recursive: true });

  res.json(envs);
});

router.delete('/:name', (req, res) => {
  const envs = readJson('environments.json');
  const filtered = envs.filter(e => e !== req.params.name);
  writeJson('environments.json', filtered);
  res.json(filtered);
});

router.put('/reorder', (req, res) => {
  const { environments } = req.body;
  if (!Array.isArray(environments)) return res.status(400).json({ error: 'environments array required' });
  writeJson('environments.json', environments);
  res.json(environments);
});

module.exports = router;
