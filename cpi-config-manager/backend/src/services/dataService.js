const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');

const readJson = (file) => {
  const fullPath = path.join(dataDir, file);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

const writeJson = (file, data) => {
  const fullPath = path.join(dataDir, file);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
};

module.exports = { readJson, writeJson, dataDir };
