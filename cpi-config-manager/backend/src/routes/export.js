const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getConfigurations, getAllIflows, getIflowsByPackage } = require('../services/cpiService');
const { readJson, dataDir } = require('../services/dataService');

const buildFilePath = (baseDir, env, folderStructure, packageId, iflowId, format) => {
  const ext = format === 'properties' ? '.properties' : '.yaml';
  if (folderStructure === 'flat') {
    return path.join(baseDir, env, `${iflowId}${ext}`);
  }
  return path.join(baseDir, env, packageId, `${iflowId}${ext}`);
};

const writeConfigFile = (filePath, iflowId, iflowName, packageId, configs, format) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (format === 'properties') {
    const lines = [
      `# CPI Config Export`,
      `# Generated: ${new Date().toISOString()}`,
      `iflowId=${iflowId}`,
      `iflowName=${iflowName || ''}`,
      `packageId=${packageId}`,
      '',
      ...configs.map(c => `${c.ParameterKey}=${c.ParameterValue}`)
    ];
    fs.writeFileSync(filePath, lines.join('\n'));
  } else {
    const data = {
      metadata: {
        iflowId,
        iflowName: iflowName || '',
        packageId,
        exportedAt: new Date().toISOString()
      },
      parameters: Object.fromEntries(
        configs.map(c => [c.ParameterKey, { value: c.ParameterValue, dataType: c.DataType || 'xsd:string' }])
      )
    };
    fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: 120 }));
  }
};

router.post('/', async (req, res) => {
  const { tenantId, selections, format, folderStructure } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  try {
    const settings = readJson('settings.json');
    const env = readJson('tenants.json').find(t => t.id === tenantId)?.environment || 'unknown';
    const exportFormat = format || settings.export.format || 'yaml';
    const structure = folderStructure || settings.export.folderStructure || 'per-package';
    const baseDir = path.join(dataDir, settings.export.baseDir || 'exports');
    const concurrency = settings.concurrency?.threads || 5;

    let iflows = [];

    if (!selections || selections.length === 0) {
      iflows = await getAllIflows(tenantId, concurrency);
    } else {
      const byPackage = {};
      const explicitIflows = [];

      for (const sel of selections) {
        if (sel.type === 'package') {
          byPackage[sel.packageId] = true;
        } else if (sel.type === 'iflow') {
          explicitIflows.push(sel);
        }
      }

      if (Object.keys(byPackage).length > 0) {
        for (const pkgId of Object.keys(byPackage)) {
          const pkgIflows = await getIflowsByPackage(tenantId, pkgId);
          iflows.push(...pkgIflows);
        }
      }

      for (const sel of explicitIflows) {
        iflows.push({ Id: sel.iflowId, Name: sel.iflowName, PackageId: sel.packageId });
      }
    }

    const results = [];
    const batchSize = concurrency;

    for (let i = 0; i < iflows.length; i += batchSize) {
      const batch = iflows.slice(i, i + batchSize);
      await Promise.all(batch.map(async (iflow) => {
        try {
          const configs = await getConfigurations(tenantId, iflow.Id);
          if (configs.length === 0) {
            results.push({ iflowId: iflow.Id, skipped: true, reason: 'No configurable parameters' });
            return;
          }

          const filePath = buildFilePath(baseDir, env, structure, iflow.PackageId || 'unknown', iflow.Id, exportFormat);
          writeConfigFile(filePath, iflow.Id, iflow.Name, iflow.PackageId, configs, exportFormat);
          results.push({ iflowId: iflow.Id, packageId: iflow.PackageId, file: filePath, params: configs.length });
        } catch (err) {
          results.push({ iflowId: iflow.Id, error: err.message });
        }
      }));
    }

    res.json({
      total: iflows.length,
      exported: results.filter(r => r.file).length,
      skipped: results.filter(r => r.skipped).length,
      errors: results.filter(r => r.error).length,
      results,
      outputDir: path.join(baseDir, env)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/diff', async (req, res) => {
  const { tenantId, iflowId, packageId } = req.query;
  if (!tenantId || !iflowId) return res.status(400).json({ error: 'tenantId and iflowId required' });
  try {
    const settings = readJson('settings.json');
    const tenant = readJson('tenants.json').find(t => t.id === tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const env = tenant.environment || 'unknown';
    const baseDir = path.join(dataDir, settings.export?.baseDir || 'exports');
    const envDir = path.join(baseDir, env);

    // Probe all plausible paths
    const candidates = [];
    if (packageId) {
      candidates.push(
        path.join(baseDir, env, packageId, `${iflowId}.yaml`),
        path.join(baseDir, env, packageId, `${iflowId}.properties`)
      );
    }
    candidates.push(
      path.join(baseDir, env, `${iflowId}.yaml`),
      path.join(baseDir, env, `${iflowId}.properties`)
    );
    if (fs.existsSync(envDir)) {
      for (const entry of fs.readdirSync(envDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== packageId) {
          candidates.push(
            path.join(envDir, entry.name, `${iflowId}.yaml`),
            path.join(envDir, entry.name, `${iflowId}.properties`)
          );
        }
      }
    }

    const filePath = candidates.find(p => fs.existsSync(p)) || null;
    const currentConfigs = await getConfigurations(tenantId, iflowId);
    const currentMap = Object.fromEntries(currentConfigs.map(c => [c.ParameterKey, c]));

    if (!filePath) {
      return res.json({
        iflowId, hasExport: false,
        currentParams: currentConfigs.map(c => ({ key: c.ParameterKey, currentValue: c.ParameterValue, dataType: c.DataType }))
      });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const exportedMap = {};
    if (filePath.endsWith('.yaml')) {
      const parsed = yaml.load(content);
      for (const [k, v] of Object.entries(parsed?.parameters || {})) {
        exportedMap[k] = typeof v === 'object' ? v.value : v;
      }
    } else {
      for (const line of content.split('\n')) {
        if (line.startsWith('#') || !line.includes('=')) continue;
        const eqIdx = line.indexOf('=');
        const k = line.slice(0, eqIdx).trim();
        if (['iflowId', 'iflowName', 'packageId'].includes(k)) continue;
        exportedMap[k] = line.slice(eqIdx + 1).trim();
      }
    }

    const allKeys = [...new Set([...Object.keys(currentMap), ...Object.keys(exportedMap)])];
    const parameters = allKeys.map(key => {
      const cur = currentMap[key]?.ParameterValue ?? null;
      const exp = exportedMap[key] ?? null;
      return {
        key,
        currentValue: cur,
        exportedValue: exp,
        dataType: currentMap[key]?.DataType,
        changed: cur !== exp,
        onlyInCurrent: !(key in exportedMap),
        onlyInExport: !(key in currentMap)
      };
    });

    res.json({
      iflowId,
      hasExport: true,
      file: path.relative(dataDir, filePath).replace(/\\/g, '/'),
      changedCount: parameters.filter(p => p.changed).length,
      parameters
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/inventory', (req, res) => {
  const { env } = req.query;
  if (!env) return res.status(400).json({ error: 'env required' });

  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, settings.export?.baseDir || 'exports');
  const envDir = path.join(baseDir, env);
  if (!fs.existsSync(envDir)) return res.json({});

  const result = {};
  for (const file of getAllFiles(envDir)) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const stat = fs.statSync(file);
      if (file.endsWith('.yaml')) {
        const parsed = yaml.load(content);
        const id = parsed?.metadata?.iflowId;
        if (id) {
          result[id] = {
            exportedAt: parsed.metadata.exportedAt || stat.mtime.toISOString(),
            file: path.relative(dataDir, file).replace(/\\/g, '/'),
            paramCount: Object.keys(parsed?.parameters || {}).length
          };
        }
      } else if (file.endsWith('.properties')) {
        const lines = content.split('\n');
        const id = lines.find(l => l.startsWith('iflowId='))?.split('=')[1]?.trim();
        if (id) {
          const paramLines = lines.filter(l => !l.startsWith('#') && l.includes('=') && !['iflowId', 'iflowName', 'packageId'].includes(l.split('=')[0]));
          result[id] = { exportedAt: stat.mtime.toISOString(), file: path.relative(dataDir, file).replace(/\\/g, '/'), paramCount: paramLines.length };
        }
      }
    } catch (_) {}
  }
  res.json(result);
});

router.get('/preview', async (req, res) => {
  const { tenantId, iflowId } = req.query;
  if (!tenantId || !iflowId) return res.status(400).json({ error: 'tenantId and iflowId required' });
  try {
    const configs = await getConfigurations(tenantId, iflowId);
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/download', (req, res) => {
  const { env } = req.query;
  if (!env) return res.status(400).json({ error: 'env required' });

  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, settings.export?.baseDir || 'exports');
  const envDir = path.join(baseDir, env);

  if (!fs.existsSync(envDir)) return res.status(404).json({ error: `No exports found for env: ${env}` });

  const { ZipArchive } = require('archiver');
  const archive = new ZipArchive({ zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="cpi-exports-${env}-${Date.now()}.zip"`);

  archive.on('error', err => { try { res.destroy(); } catch (_) {} });
  archive.pipe(res);
  archive.directory(envDir, false);
  archive.finalize();
});

router.delete('/folder', (req, res) => {
  const { env } = req.query;
  if (!env) return res.status(400).json({ error: 'env required' });

  const settings = readJson('settings.json');
  const baseDir = path.join(dataDir, settings.export?.baseDir || 'exports');
  const envDir = path.join(baseDir, env);

  if (!fs.existsSync(envDir)) return res.json({ cleared: 0, message: 'Folder did not exist' });

  const files = getAllFiles(envDir);
  let cleared = 0;
  for (const f of files) {
    try { fs.unlinkSync(f); cleared++; } catch (_) {}
  }
  // Remove empty subdirectories
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
  const baseDir = path.join(dataDir, settings.export.baseDir || 'exports');

  if (!fs.existsSync(baseDir)) return res.json({ envs: [] });

  const envs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const envPath = path.join(baseDir, d.name);
      const files = getAllFiles(envPath);
      return { env: d.name, files: files.map(f => path.relative(baseDir, f).replace(/\\/g, '/')) };
    });

  res.json({ baseDir, envs });
});

const getAllFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...getAllFiles(full));
    else result.push(full);
  }
  return result;
};

module.exports = router;
