const fs = require('fs');
const path = require('path');

function loadEnv() {
  const rootDir = path.resolve(__dirname, '../..');
  const envPath = fs.existsSync(path.join(rootDir, '.env'))
    ? path.join(rootDir, '.env')
    : path.join(process.cwd(), '.env');

  const envVars = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...vals] = trimmed.split('=');
        envVars[key.trim()] = vals.join('=').trim();
      }
    });
  }
  return envVars;
}

module.exports = { loadEnv };
