const axios = require('axios');
const { readJson, writeJson } = require('./dataService');

const isTokenExpired = (tenant) => {
  if (!tenant.auth.token) return true;
  const { access_token, expires_in, fetched_at } = tenant.auth.token;
  if (!access_token) return true;
  const expiresAt = fetched_at + (expires_in * 1000) - 60000;
  return Date.now() >= expiresAt;
};

const fetchToken = async (tenant) => {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', tenant.auth.clientId);
  params.append('client_secret', tenant.auth.clientSecret);

  const response = await axios.post(tenant.auth.tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  });

  const tokenData = {
    access_token: response.data.access_token,
    expires_in: response.data.expires_in || 3600,
    token_type: response.data.token_type || 'Bearer',
    fetched_at: Date.now()
  };

  const tenants = readJson('tenants.json');
  const idx = tenants.findIndex(t => t.id === tenant.id);
  if (idx !== -1) {
    tenants[idx].auth.token = tokenData;
    tenants[idx].auth.lastRefreshed = new Date().toISOString();
    writeJson('tenants.json', tenants);
  }

  return tokenData;
};

const getValidToken = async (tenantId) => {
  const tenants = readJson('tenants.json');
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  if (isTokenExpired(tenant)) {
    const token = await fetchToken(tenant);
    return token.access_token;
  }
  return tenant.auth.token.access_token;
};

const getTokenInfo = (tenantId) => {
  const tenants = readJson('tenants.json');
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant || !tenant.auth.token) return null;

  const { access_token, expires_in, token_type, fetched_at } = tenant.auth.token;
  const expiresAt = new Date(fetched_at + expires_in * 1000);
  const expired = isTokenExpired(tenant);

  return {
    access_token: access_token ? `${access_token.substring(0, 40)}...` : null,
    access_token_full: access_token,
    expires_in,
    token_type,
    fetched_at: new Date(fetched_at).toISOString(),
    expires_at: expiresAt.toISOString(),
    expired,
    lastRefreshed: tenant.auth.lastRefreshed
  };
};

module.exports = { getValidToken, fetchToken, isTokenExpired, getTokenInfo };
