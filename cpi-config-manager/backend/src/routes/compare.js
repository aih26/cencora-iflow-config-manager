const express = require('express');
const router = express.Router();
const { getConfigurations, getAllIflows } = require('../services/cpiService');
const { readJson } = require('../services/dataService');

router.post('/', async (req, res) => {
  const { sourceTenantId, targetTenantId, packageIds, iflowIds } = req.body;
  if (!sourceTenantId || !targetTenantId) return res.status(400).json({ error: 'sourceTenantId and targetTenantId required' });

  try {
    const settings = readJson('settings.json');
    const concurrency = settings.concurrency?.threads || 5;

    // Fetch iflow lists from both tenants in parallel
    const [sourceIflows, targetIflows] = await Promise.all([
      getAllIflows(sourceTenantId, concurrency),
      getAllIflows(targetTenantId, concurrency)
    ]);

    // Filter scope if requested
    let scopedSource = sourceIflows;
    if (packageIds?.length) scopedSource = scopedSource.filter(i => packageIds.includes(i.PackageId));
    if (iflowIds?.length) scopedSource = scopedSource.filter(i => iflowIds.includes(i.Id));

    const targetMap = new Map(targetIflows.map(i => [i.Id, i]));
    const sourceIdSet = new Set(scopedSource.map(i => i.Id));

    const results = [];

    // Compare each source iflow
    for (let i = 0; i < scopedSource.length; i += concurrency) {
      const batch = scopedSource.slice(i, i + concurrency);
      await Promise.all(batch.map(async (iflow) => {
        if (!targetMap.has(iflow.Id)) {
          results.push({ iflowId: iflow.Id, iflowName: iflow.Name, packageId: iflow.PackageId, status: 'missing-in-target', diffCount: 0, paramCount: 0, parameters: [] });
          return;
        }
        try {
          const [srcCfg, tgtCfg] = await Promise.all([
            getConfigurations(sourceTenantId, iflow.Id).catch(() => []),
            getConfigurations(targetTenantId, iflow.Id).catch(() => [])
          ]);
          const srcMap = Object.fromEntries(srcCfg.map(c => [c.ParameterKey, c.ParameterValue]));
          const tgtMap = Object.fromEntries(tgtCfg.map(c => [c.ParameterKey, c.ParameterValue]));
          const allKeys = [...new Set([...Object.keys(srcMap), ...Object.keys(tgtMap)])].sort();
          const parameters = allKeys.map(key => ({
            key,
            sourceValue: srcMap[key] ?? null,
            targetValue: tgtMap[key] ?? null,
            status: !(key in tgtMap) ? 'missing-in-target' : !(key in srcMap) ? 'missing-in-source' : srcMap[key] === tgtMap[key] ? 'same' : 'different'
          }));
          const diffCount = parameters.filter(p => p.status !== 'same').length;
          results.push({ iflowId: iflow.Id, iflowName: iflow.Name, packageId: iflow.PackageId, status: diffCount === 0 ? 'same' : 'different', diffCount, paramCount: parameters.length, parameters });
        } catch (err) {
          results.push({ iflowId: iflow.Id, iflowName: iflow.Name, packageId: iflow.PackageId, status: 'error', error: err.message, diffCount: 0, paramCount: 0, parameters: [] });
        }
      }));
    }

    // iflows only in target (not in scoped source)
    for (const tflow of targetIflows) {
      if (!sourceIdSet.has(tflow.Id)) {
        results.push({ iflowId: tflow.Id, iflowName: tflow.Name, packageId: tflow.PackageId, status: 'missing-in-source', diffCount: 0, paramCount: 0, parameters: [] });
      }
    }

    const summary = {
      total: results.length,
      same: results.filter(r => r.status === 'same').length,
      different: results.filter(r => r.status === 'different').length,
      missingInTarget: results.filter(r => r.status === 'missing-in-target').length,
      missingInSource: results.filter(r => r.status === 'missing-in-source').length,
      errors: results.filter(r => r.status === 'error').length
    };

    res.json({ summary, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
