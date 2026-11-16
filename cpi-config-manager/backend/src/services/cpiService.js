const axios = require('axios');
const { getValidToken } = require('./tokenService');
const { readJson } = require('./dataService');

const getTenant = (tenantId) => {
  const tenants = readJson('tenants.json');
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  return tenant;
};

const getApiCfg = (key) => {
  const settings = readJson('settings.json');
  return settings?.apiConfigs?.[key] || { extraParams: {}, extraHeaders: {} };
};

const buildParams = (base, extraParams = {}) => {
  const p = { ...base };
  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== '' && v != null) p[k] = v;
  }
  return new URLSearchParams(p).toString();
};

// OData string-literal escaping: single quotes are doubled, NOT percent-encoded
const encodeId = (s) => s.replace(/'/g, "''");

const buildClient = async (tenantId, extraHeaders = {}) => {
  const tenant = getTenant(tenantId);
  const token = await getValidToken(tenantId);
  return axios.create({
    baseURL: `${tenant.host}/api/v1`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    timeout: 60000
  });
};

// ── CSRF token cache (per tenant, valid ~24 min) ─────────────────────────────
const csrfCache = {};
const CSRF_TTL_MS = 24 * 60 * 1000;

const fetchCsrf = async (tenantId) => {
  const tenant = getTenant(tenantId);
  const bearerToken = await getValidToken(tenantId);
  const res = await axios.get(`${tenant.host}/api/v1/`, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'x-csrf-token': 'Fetch',
      Accept: 'application/json'
    },
    validateStatus: () => true, // CPI may return 4xx — headers still present
    timeout: 15000
  });
  const token = res.headers['x-csrf-token'];
  if (!token || token.toLowerCase() === 'required' || token.toLowerCase() === 'fetch') {
    throw new Error('CPI did not return a CSRF token on CSRF fetch');
  }
  const rawCookies = res.headers['set-cookie'] || [];
  const cookies = (Array.isArray(rawCookies) ? rawCookies : [rawCookies])
    .map(c => c.split(';')[0])
    .join('; ');
  return { token, cookies };
};

const getCsrf = async (tenantId) => {
  const now = Date.now();
  const c = csrfCache[tenantId];
  if (c && now - c.fetchedAt < CSRF_TTL_MS) return { token: c.token, cookies: c.cookies };
  const { token, cookies } = await fetchCsrf(tenantId);
  csrfCache[tenantId] = { token, cookies, fetchedAt: now };
  return { token, cookies };
};

const invalidateCsrf = (tenantId) => { delete csrfCache[tenantId]; };

// ── Active version cache (per tenant+iflow, valid 5 min) ─────────────────────
const versionCache = {};
const VERSION_TTL_MS = 5 * 60 * 1000;

const getActiveVersion = async (tenantId, iflowId, packageId = null) => {
  const cacheKey = `${tenantId}__${iflowId}`;
  const now = Date.now();
  const c = versionCache[cacheKey];
  if (c && now - c.fetchedAt < VERSION_TTL_MS) return c.version;

  const tenant = getTenant(tenantId);
  const bearerToken = await getValidToken(tenantId);
  const headers = { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json' };

  // Try single-entity read (capital-A 'Active' per OData convention)
  const singleRes = await axios.get(
    `${tenant.host}/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeId(iflowId)}',Version='Active')?$format=json`,
    { headers, validateStatus: () => true, timeout: 30000 }
  );
  if (singleRes.status === 200 && singleRes.data?.d?.Version) {
    const version = singleRes.data.d.Version;
    versionCache[cacheKey] = { version, fetchedAt: now };
    return version;
  }

  // Fallback: collection filter
  const filterRes = await axios.get(
    `${tenant.host}/api/v1/IntegrationDesigntimeArtifacts?$filter=Id eq '${encodeId(iflowId)}'&$format=json`,
    { headers, validateStatus: () => true, timeout: 30000 }
  );
  if (filterRes.status === 200) {
    const results = filterRes.data?.d?.results || [];
    const item = results.find(r => r.Version && r.Version !== 'active') || results[0];
    if (item?.Version) {
      versionCache[cacheKey] = { version: item.Version, fetchedAt: now };
      return item.Version;
    }
  }

  // Fallback: package navigation (requires packageId)
  if (packageId) {
    const pkgRes = await axios.get(
      `${tenant.host}/api/v1/IntegrationPackages('${encodeId(packageId)}')/IntegrationDesigntimeArtifacts?$format=json`,
      { headers, validateStatus: () => true, timeout: 30000 }
    );
    if (pkgRes.status === 200) {
      const results = pkgRes.data?.d?.results || [];
      const item = results.find(r => r.Id === iflowId);
      if (item?.Version) {
        console.log('[getActiveVersion] resolved via package nav:', item.Version);
        versionCache[cacheKey] = { version: item.Version, fetchedAt: now };
        return item.Version;
      }
    }
  }

  throw new Error(`HTTP ${singleRes.status}: ${JSON.stringify(singleRes.data).slice(0, 150)}`);
};

// ── Public API ────────────────────────────────────────────────────────────────

const getPackages = async (tenantId) => {
  const cfg = getApiCfg('listPackages');
  const client = await buildClient(tenantId, cfg.extraHeaders);
  const qs = buildParams({ $format: 'json' }, cfg.extraParams);
  const res = await client.get(`/IntegrationPackages?${qs}`);
  return (res.data?.d?.results || []).map(p => ({
    Id: p.Id,
    Name: p.Name,
    Description: p.Description,
    Version: p.Version,
    Vendor: p.Vendor,
    Mode: p.Mode,
    SupportedPlatform: p.SupportedPlatform,
    ModifiedBy: p.ModifiedBy,
    ModifiedAt: p.ModifiedAt,
    CreatedBy: p.CreatedBy,
    CreatedAt: p.CreatedAt
  }));
};

const getIflowsByPackage = async (tenantId, packageId) => {
  const cfg = getApiCfg('listIflows');
  const client = await buildClient(tenantId, cfg.extraHeaders);
  const encoded = encodeURIComponent(packageId);
  const qs = buildParams({ $format: 'json' }, cfg.extraParams);
  const res = await client.get(
    `/IntegrationPackages('${encoded}')/IntegrationDesigntimeArtifacts?${qs}`
  );
  return (res.data?.d?.results || []).map(f => ({ ...f, PackageId: packageId }));
};

const getAllIflows = async (tenantId, concurrency = 5) => {
  const packages = await getPackages(tenantId);
  const results = [];
  for (let i = 0; i < packages.length; i += concurrency) {
    const chunk = packages.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (pkg) => {
        try { return await getIflowsByPackage(tenantId, pkg.Id); }
        catch (e) { console.warn(`Failed to fetch iflows for package ${pkg.Id}: ${e.message}`); return []; }
      })
    );
    results.push(...chunkResults.flat());
  }
  return results;
};

const getRuntimeStatus = async (tenantId, iflowIds) => {
  const cfg = getApiCfg('runtimeStatus');
  const client = await buildClient(tenantId, cfg.extraHeaders);
  const filter = iflowIds.map(id => `Id eq '${id}'`).join(' or ');
  const qs = buildParams({ $format: 'json', $filter: filter }, cfg.extraParams);
  const res = await client.get(`/IntegrationRuntimeArtifacts?${qs}`);
  const items = res.data?.d?.results || [];
  return Object.fromEntries(items.map(r => [r.Id, r]));
};

const getConfigurations = async (tenantId, iflowId, version = 'active') => {
  const cfg = getApiCfg('getConfigurations');
  const client = await buildClient(tenantId, cfg.extraHeaders);
  const id = encodeURIComponent(iflowId);
  const qs = buildParams({ $format: 'json' }, cfg.extraParams);
  const res = await client.get(
    `/IntegrationDesigntimeArtifacts(Id='${id}',Version='${version}')/Configurations?${qs}`
  );
  return res.data?.d?.results || [];
};

const updateConfiguration = async (tenantId, iflowId, paramKey, paramValue, dataType = 'xsd:string', packageId = null) => {
  const tenant = getTenant(tenantId);
  const bearerToken = await getValidToken(tenantId);

  // Resolve version — 'Active' (capital A) required; fallbacks via collection/package
  let version;
  try {
    version = await getActiveVersion(tenantId, iflowId, packageId);
  } catch (verErr) {
    throw new Error(`Could not resolve active version for "${iflowId}": ${verErr.message}`);
  }

  // CSRF token + session cookie — required for all mutating CPI OData calls
  let csrf;
  try {
    csrf = await getCsrf(tenantId);
  } catch (csrfErr) {
    throw new Error(`CSRF fetch failed: ${csrfErr.message}`);
  }

  const body = JSON.stringify({ ParameterKey: paramKey, ParameterValue: paramValue, DataType: dataType });
  const commonHeaders = (csrfToken, cookies) => ({
    Authorization: `Bearer ${bearerToken}`,
    'x-csrf-token': csrfToken,
    Cookie: cookies,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  });

  const doReq = async (url, csrfToken, cookies) => axios.put(url, body, {
    headers: commonHeaders(csrfToken, cookies),
    timeout: 60000,
    validateStatus: () => true
  });

  const retryWithFreshCsrf = async (url) => {
    let res = await doReq(url, csrf.token, csrf.cookies);
    if (res.status === 403) {
      invalidateCsrf(tenantId);
      csrf = await getCsrf(tenantId);
      res = await doReq(url, csrf.token, csrf.cookies);
    }
    return res;
  };

  // Try $links URL (requires real version, not 'active' alias)
  const linksUrl = `${tenant.host}/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeId(iflowId)}',Version='${version}')/$links/Configurations('${encodeId(paramKey)}')`;
  let res = await retryWithFreshCsrf(linksUrl);

  // $links not supported on all tenants — fall back to /Configurations navigation
  if (res.status === 501 || res.status === 404) {
    console.log(`[updateConfig] $links returned ${res.status} — trying /Configurations fallback`);
    const configUrl = `${tenant.host}/api/v1/IntegrationDesigntimeArtifacts(Id='${encodeId(iflowId)}',Version='${version}')/Configurations('${encodeId(paramKey)}')`;
    res = await retryWithFreshCsrf(configUrl);
  }

  if (res.status !== 200 && res.status !== 202 && res.status !== 204) {
    const d = res.data;
    const detail = d?.error?.message?.value || d?.message || (typeof d === 'string' ? d : null) || `HTTP ${res.status}`;
    throw new Error(`${detail} (HTTP ${res.status})`);
  }
};

const deployIflow = async (tenantId, iflowId, version = 'active') => {
  const tenant = getTenant(tenantId);
  const bearerToken = await getValidToken(tenantId);
  const { token: csrfToken, cookies } = await getCsrf(tenantId);

  const res = await axios.post(
    `${tenant.host}/api/v1/DeployIntegrationDesigntimeArtifact?Id='${encodeId(iflowId)}'&Version='${version}'`,
    null,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'x-csrf-token': csrfToken,
        Cookie: cookies,
        Accept: 'application/json'
      },
      timeout: 60000
    }
  );
  return res.data;
};

const getDeploymentStatus = async (tenantId, taskId) => {
  const client = await buildClient(tenantId);
  const res = await client.get(`/BuildAndDeployStatus(TaskId='${taskId}')?$format=json`);
  return res.data?.d || res.data;
};

module.exports = {
  getPackages,
  getIflowsByPackage,
  getAllIflows,
  getRuntimeStatus,
  getConfigurations,
  updateConfiguration,
  deployIflow,
  getDeploymentStatus,
  getActiveVersion
};
