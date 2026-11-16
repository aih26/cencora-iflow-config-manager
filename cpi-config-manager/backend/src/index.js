const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json({ limit: '50mb' }));

const dataDir = path.join(__dirname, '../data');
const exportsDir = path.join(dataDir, 'exports');
const importsDir = path.join(dataDir, 'imports');

[dataDir, exportsDir, importsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const initFile = (file, defaultData) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
  }
};

initFile(path.join(dataDir, 'settings.json'), {
  app: { name: 'CPI Config Manager', logo: null, theme: 'light', defaultPageSize: 20 },
  dashboard: {
    columns: [
      { key: 'Id', label: 'ID', visible: true, width: 200 },
      { key: 'Name', label: 'Name', visible: true, width: 300 },
      { key: 'PackageId', label: 'Package', visible: true, width: 200 },
      { key: 'Status', label: 'Status', visible: true, width: 120 },
      { key: 'Version', label: 'Version', visible: true, width: 100 },
      { key: 'DeployedBy', label: 'Deployed By', visible: false, width: 150 },
      { key: 'DeployedOn', label: 'Deployed On', visible: false, width: 180 },
      { key: 'Description', label: 'Description', visible: false, width: 250 },
      { key: 'CreatedBy', label: 'Created By', visible: false, width: 150 },
      { key: 'ModifiedBy', label: 'Modified By', visible: false, width: 150 }
    ]
  },
  export: { folderStructure: 'per-package', format: 'yaml', baseDir: 'exports' },
  import: { folderStructure: 'per-package', baseDir: 'imports' },
  concurrency: { threads: 5 },
  customActions: [],
  apiConfigs: {
    listPackages: { extraParams: {}, extraHeaders: {} },
    listIflows: { extraParams: {}, extraHeaders: {} },
    runtimeStatus: { extraParams: {}, extraHeaders: {} },
    getConfigurations: { extraParams: {}, extraHeaders: {} },
    updateConfiguration: { extraParams: {}, extraHeaders: {} },
    deployIflow: { extraParams: {}, extraHeaders: {} }
  }
});
initFile(path.join(dataDir, 'tenants.json'), []);
initFile(path.join(dataDir, 'environments.json'), ['dev', 'qa', 'stage', 'prd']);

// API routes
app.use('/api/settings', require('./routes/settings'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/environments', require('./routes/environments'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/iflows', require('./routes/iflows'));
app.use('/api/export', require('./routes/export'));
app.use('/api/import', require('./routes/import'));
app.use('/api/deploy', require('./routes/deploy'));
app.use('/api/execute-action', require('./routes/actions'));
app.use('/api/compare', require('./routes/compare'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Serve built React frontend
const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('<h2>Frontend not built yet. Run <code>npm run build</code> then restart.</h2>');
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CPI Config Manager running on http://localhost:${PORT}`);
});
