const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getConfigurations, updateConfiguration } = require('../services/cpiService');
const { readJson, dataDir } = require('../services/dataService');

const parseConfigFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml') {
    const parsed = yaml.load(content);
    return {
      iflowId: parsed.metadata?.iflowId,
      iflowName: parsed.metadata?.iflowName,
      packageId: parsed.metadata?.packageId,
      parameters: Object.entries(parsed.parameters || {}).map(([key, val]) => ({
        ParameterKey: key,
        ParameterValue: val == null ? '' : (typeof val === 'object' ? val.value : String(val)),
        DataType: val == null ? 'xsd:string' : (typeof val === 'object' ? (val.dataType || 'xsd:string') : 'xsd:string')
      }))
    };
  }

  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const params = {};
  let iflowId, iflowName, packageId;

  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim();
    if (key === 'iflowId') iflowId = value;
    else if (key === 'iflowName') iflowName = value;
    else if (key === 'packageId') packageId = value;
    else params[key.trim()] = value;
  }

  return {
    iflowId,
    iflowName,
    packageId,
    parameters: Object.entries(params).map(([k, v]) => ({
      ParameterKey: k,
      ParameterValue: v,
      DataType: 'xsd:string'
    }))
  };
};

const multer = require('multer');
const AdmZip = require('adm-zip');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', upload.array('files', 200), (req, res) => {
  const { env } = req.body;
  if (!env) return res.status(400).json({ error: 'env required' });

  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, settings.import?.baseDir || 'imports');
  const envDir = path.join(baseDir, env);

  const saved = [];
  const errors = [];

  for (const file of req.files || []) {
    try {
      const isZip = file.mimetype === 'application/zip' ||
                    file.mimetype === 'application/x-zip-compressed' ||
                    file.originalname.toLowerCase().endsWith('.zip');

      if (isZip) {
        const zip = new AdmZip(file.buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const entryName = entry.entryName.replace(/\\/g, '/');
          // Skip macOS metadata and hidden files
          if (entryName.includes('__MACOSX') || path.basename(entryName).startsWith('.')) continue;
          if (!/\.(yaml|yml|properties)$/i.test(entryName)) continue;
          const dest = path.join(envDir, entryName);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, entry.getData());
          saved.push(entryName);
        }
      } else {
        const safeName = file.originalname.replace(/\.\./g, '').replace(/\\/g, '/');
        const dest = path.join(envDir, safeName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, file.buffer);
        saved.push(safeName);
      }
    } catch (err) {
      errors.push({ file: file.originalname, error: err.message });
    }
  }

  res.json({ saved: saved.length, files: saved, errors });
});

router.post('/preview', async (req, res) => {
  const { tenantId, env, iflowIds, sourceFolder } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  try {
    const settings = readJson('settings.json');
    const folderKey = sourceFolder === 'exports' ? 'export' : 'import';
    const defaultDir = sourceFolder === 'exports' ? 'exports' : 'imports';
    const baseDir = path.join(dataDir, settings[folderKey]?.baseDir || defaultDir);
    const envDir = path.join(baseDir, env || readJson('tenants.json').find(t => t.id === tenantId)?.environment || 'dev');

    const diffs = [];
    const files = getAllYamlFiles(envDir);

    for (const filePath of files) {
      try {
        const fileConfig = parseConfigFile(filePath);
        if (!fileConfig.iflowId) continue;
        if (iflowIds && iflowIds.length && !iflowIds.includes(fileConfig.iflowId)) continue;

        const currentConfigs = await getConfigurations(tenantId, fileConfig.iflowId);
        const currentMap = Object.fromEntries(currentConfigs.map(c => [c.ParameterKey, c]));

        const paramDiffs = fileConfig.parameters.map(p => {
          const current = currentMap[p.ParameterKey];
          return {
            key: p.ParameterKey,
            currentValue: current?.ParameterValue ?? null,
            newValue: p.ParameterValue,
            dataType: p.DataType || current?.DataType || 'xsd:string',
            changed: current?.ParameterValue !== p.ParameterValue,
            isNew: !current
          };
        });

        diffs.push({
          iflowId: fileConfig.iflowId,
          iflowName: fileConfig.iflowName,
          packageId: fileConfig.packageId,
          file: path.relative(baseDir, filePath).replace(/\\/g, '/'),
          parameters: paramDiffs,
          changedCount: paramDiffs.filter(p => p.changed || p.isNew).length
        });
      } catch (err) {
        diffs.push({ file: path.relative(baseDir, filePath), error: err.message });
      }
    }

    res.json(diffs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/apply', async (req, res) => {
  const { tenantId, env, iflowIds, onlyChanged = true, sourceFolder } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  try {
    const settings = readJson('settings.json');
    const folderKey = sourceFolder === 'exports' ? 'export' : 'import';
    const defaultDir = sourceFolder === 'exports' ? 'exports' : 'imports';
    const baseDir = path.join(dataDir, settings[folderKey]?.baseDir || defaultDir);
    const envDir = path.join(baseDir, env || readJson('tenants.json').find(t => t.id === tenantId)?.environment || 'dev');
    const concurrency = settings.concurrency?.threads || 5;

    const files = getAllYamlFiles(envDir);
    const results = [];

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      await Promise.all(batch.map(async (filePath) => {
        try {
          const fileConfig = parseConfigFile(filePath);
          if (!fileConfig.iflowId) return;
          if (iflowIds && iflowIds.length && !iflowIds.includes(fileConfig.iflowId)) return;

          const currentConfigs = await getConfigurations(tenantId, fileConfig.iflowId);
          const currentMap = Object.fromEntries(currentConfigs.map(c => [c.ParameterKey, c]));

          const toUpdate = fileConfig.parameters.filter(p => {
            if (!onlyChanged) return true;
            return currentMap[p.ParameterKey]?.ParameterValue !== p.ParameterValue;
          });

          const updateResults = [];
          for (const param of toUpdate) {
            try {
              const dataType = currentMap[param.ParameterKey]?.DataType || param.DataType || 'xsd:string';
              await updateConfiguration(
                tenantId,
                fileConfig.iflowId,
                param.ParameterKey,
                param.ParameterValue,
                dataType,
                fileConfig.packageId
              );
              updateResults.push({ key: param.ParameterKey, status: 'updated' });
            } catch (err) {
              updateResults.push({
                key: param.ParameterKey,
                status: 'error',
                error: err.message
              });
            }
          }

          results.push({
            iflowId: fileConfig.iflowId,
            packageId: fileConfig.packageId,
            updated: updateResults.filter(r => r.status === 'updated').length,
            errors: updateResults.filter(r => r.status === 'error').length,
            details: updateResults
          });
        } catch (err) {
          results.push({ file: path.relative(baseDir, filePath), error: err.message });
        }
      }));
    }

    res.json({
      total: results.length,
      updated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
      errors: results.filter(r => r.error || r.errors > 0).length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/inventory', (req, res) => {
  const { env, baseDir: baseDirOverride } = req.query;
  if (!env) return res.status(400).json({ error: 'env required' });

  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, baseDirOverride || settings.import?.baseDir || 'imports');
  const envDir = path.join(baseDir, env);

  if (!fs.existsSync(envDir)) return res.json({});

  const files = getAllYamlFiles(envDir);
  const inventory = {};

  for (const filePath of files) {
    try {
      const config = parseConfigFile(filePath);
      if (!config.iflowId) continue;
      inventory[config.iflowId] = {
        file: path.relative(baseDir, filePath).replace(/\\/g, '/'),
        iflowName: config.iflowName,
        packageId: config.packageId,
        paramCount: config.parameters.length
      };
    } catch (_) {}
  }

  res.json(inventory);
});

router.delete('/folder', (req, res) => {
  const { env } = req.query;
  if (!env) return res.status(400).json({ error: 'env required' });

  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, settings.import?.baseDir || 'imports');
  const envDir = path.join(baseDir, env);

  if (!fs.existsSync(envDir)) return res.json({ cleared: 0, message: 'Folder did not exist' });

  const files = getAllYamlFiles(envDir);
  let cleared = 0;
  for (const f of files) {
    try { fs.unlinkSync(f); cleared++; } catch (_) {}
  }
  const cleanDirs = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sub = path.join(dir, entry.name);
        cleanDirs(sub);
        try { fs.rmdirSync(sub); } catch (_) {}
      }
    }
  };
  cleanDirs(envDir);

  res.json({ cleared, env });
});

router.get('/files', (req, res) => {
  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, settings.import.baseDir || 'imports');
  if (!fs.existsSync(baseDir)) return res.json({ envs: [] });

  const envs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({
      env: d.name,
      files: getAllYamlFiles(path.join(baseDir, d.name))
        .map(f => path.relative(baseDir, f).replace(/\\/g, '/'))
    }));

  res.json({ baseDir, envs });
});

const getAllYamlFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...getAllYamlFiles(full));
    else if (/\.(yaml|yml|properties)$/.test(entry.name)) result.push(full);
  }
  return result;
};

module.exports = router;
