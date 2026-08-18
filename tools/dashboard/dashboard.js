const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const BenchmarkEngine = require('../../scripts/benchmark');

function loadEnv() {
  const envPath = fs.existsSync(path.join(__dirname, '../../.env')) ? path.join(__dirname, '../../.env') : path.join(process.cwd(), '.env');
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

const env = loadEnv();
const PORT = parseInt(env.DASHBOARD_PORT || '3010', 10);

const CONTAINERS = [
  { name: 'melchior', role: 'PostgreSQL Primary Master (Write)' },
  { name: 'balthasar', role: 'PostgreSQL Read Replica 1' },
  { name: 'casper', role: 'PostgreSQL Read Replica 2' },
  { name: 'pgbouncer', role: 'PgBouncer Connection Pooler' },
  { name: 'redis', role: 'Redis Cache (In-Memory Store)' },
  { name: 'haproxy', role: 'HAProxy Load Balancer' },
  { name: 'minio', role: 'MinIO Object Storage' },
  { name: 'adminer', role: 'Adminer Studio DB Manager' },
  { name: 'prometheus', role: 'Prometheus Metrics Server' },
  { name: 'grafana', role: 'Grafana Monitoring Studio' }
];

let activeBenchmarkEngine = null;
let currentMetrics = {
  rps: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  replicationLagMs: 0,
  activeSuite: 'idle'
};

const sseClients = [];
const chaosTimers = {};
const auditLogs = [];

function logAuditEvent(msg) {
  const timestamp = new Date().toLocaleTimeString('fr-FR');
  const entry = '[' + timestamp + '] ' + msg;
  auditLogs.unshift(entry);
  if (auditLogs.length > 50) auditLogs.pop();
  broadcastSSE({ auditLog: entry });
}

function broadcastSSE(data) {
  const message = 'data: ' + JSON.stringify(data) + '\n\n';
  sseClients.forEach(client => client.res.write(message));
}

let watchdogProcess = null;
let watchdogActive = false;

function toggleWatchdog(enable) {
  if (enable && !watchdogActive) {
    watchdogActive = true;
    logAuditEvent('🛡️ Failover Watchdog Daemon ACTIVÉ.');
    watchdogProcess = exec('bash scripts/failover-watchdog.sh');
    watchdogProcess.stdout.on('data', data => {
      data.toString().split('\n').filter(Boolean).forEach(line => {
        logAuditEvent(line);
      });
    });
    watchdogProcess.stderr.on('data', data => console.error(data.toString()));
  } else if (!enable && watchdogActive) {
    watchdogActive = false;
    if (watchdogProcess) watchdogProcess.kill();
    logAuditEvent('🛡️ Failover Watchdog Daemon DÉSACTIVÉ.');
  }
}

function getSystemMetrics(callback) {
  exec('docker ps -a --format "{{.Names}}|{{.Status}}|{{.State}}"', (errPs, stdoutPs) => {
    const statusMap = {};
    if (!errPs && stdoutPs) {
      stdoutPs.trim().split('\n').forEach(line => {
        const [name, status, state] = line.split('|');
        if (name) statusMap[name] = { status, state };
      });
    }

    exec('docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"', (errStats, stdoutStats) => {
      const statsMap = {};
      if (!errStats && stdoutStats) {
        stdoutStats.trim().split('\n').forEach(line => {
          const [name, cpu, mem] = line.split('|');
          if (name) statsMap[name] = { cpu: cpu || '0%', mem: mem || '0B' };
        });
      }

      const containersResult = CONTAINERS.map(c => {
        const info = statusMap[c.name] || { status: 'Stopped', state: 'exited' };
        const hardware = statsMap[c.name] || { cpu: '0%', mem: '0B' };
        return {
          name: c.name,
          role: c.role,
          status: info.status,
          state: info.state,
          cpu: hardware.cpu,
          mem: hardware.mem
        };
      });

      callback({
        containers: containersResult,
        benchmark: currentMetrics,
        watchdogActive,
        auditLogs
      });
    });
  });
}

setInterval(() => {
  if (sseClients.length > 0) {
    getSystemMetrics((data) => {
      broadcastSSE(data);
    });
  }
}, 1000);

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    req.on('close', () => {
      const idx = sseClients.findIndex(c => c.id === clientId);
      if (idx !== -1) sseClients.splice(idx, 1);
    });

    getSystemMetrics(data => broadcastSSE(data));
    return;
  }

  if (pathname === '/api/status') {
    getSystemMetrics(data => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    });
    return;
  }

  if (pathname === '/api/chaos/kill') {
    const node = parsedUrl.searchParams.get('node') || 'melchior';
    const duration = parseInt(parsedUrl.searchParams.get('duration') || '0', 10);

    logAuditEvent('💣 ACTION CHAOS : Arrêt du nœud \'' + node + '\'' + (duration > 0 ? ' pour ' + duration + 's' : '') + '...');
    exec('docker stop ' + node, (err) => {
      if (err) {
        logAuditEvent('❌ Échec de l\'arrêt de \'' + node + '\': ' + err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      } else {
        logAuditEvent('🔥 Nœud \'' + node + '\' ARRÊTÉ avec succès.');

        if (chaosTimers[node]) clearTimeout(chaosTimers[node]);

        if (duration > 0) {
          logAuditEvent('⏱️ Programmation du redémarrage auto de \'' + node + '\' dans ' + duration + ' secondes...');
          chaosTimers[node] = setTimeout(() => {
            logAuditEvent('🔄 Expiration du minuteur (' + duration + 's) : Redémarrage du nœud \'' + node + '\'...');
            exec('docker start ' + node, (startErr) => {
              if (startErr) logAuditEvent('❌ Erreur redémarrage \'' + node + '\': ' + startErr.message);
              else logAuditEvent('✅ Nœud \'' + node + '\' REDÉMARRÉ et réintégré.');
            });
            delete chaosTimers[node];
          }, duration * 1000);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', node, duration }));
      }
    });
    return;
  }

  if (pathname === '/api/chaos/restart') {
    const node = parsedUrl.searchParams.get('node') || 'melchior';
    if (chaosTimers[node]) {
      clearTimeout(chaosTimers[node]);
      delete chaosTimers[node];
    }
    logAuditEvent('🔄 Action Manuelle : Redémarrage du nœud \'' + node + '\'...');
    exec('docker start ' + node, (err) => {
      if (err) {
        logAuditEvent('❌ Échec redémarrage \'' + node + '\': ' + err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      } else {
        logAuditEvent('✅ Nœud \'' + node + '\' redémarré.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', node }));
      }
    });
    return;
  }

  if (pathname === '/api/chaos/promote') {
    const target = parsedUrl.searchParams.get('target') || 'balthasar';
    logAuditEvent('🚀 FAILOVER MANUEL : Promotion de \'' + target + '\' en PRIMARY...');
    exec('bash scripts/failover-promote.sh ' + target + ' true', (err, stdout) => {
      if (err) {
        logAuditEvent('❌ Échec de promotion de \'' + target + '\': ' + err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      } else {
        logAuditEvent('🎉 Node \'' + target + '\' PROMU avec succès en Primary !');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', target, output: stdout }));
      }
    });
    return;
  }

  if (pathname === '/api/chaos/watchdog') {
    const enable = parsedUrl.searchParams.get('enable') === 'true';
    toggleWatchdog(enable);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success', watchdogActive }));
    return;
  }

  if (pathname === '/api/backup') {
    logAuditEvent('📦 Lancement de la sauvegarde S3 MinIO...');
    exec('sh scripts/backup-db.sh', (err, stdout, stderr) => {
      if (err) {
        logAuditEvent('❌ Erreur de sauvegarde S3: ' + stderr);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: stderr }));
      } else {
        logAuditEvent('✅ Sauvegarde S3 exécutée.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', output: stdout }));
      }
    });
    return;
  }

  if (pathname === '/api/benchmark/start') {
    const suite = parsedUrl.searchParams.get('suite') || 'suite1_baseline';
    const duration = parseInt(parsedUrl.searchParams.get('duration') || '30', 10);
    const concurrency = parseInt(parsedUrl.searchParams.get('concurrency') || '25', 10);

    if (activeBenchmarkEngine && activeBenchmarkEngine.running) {
      activeBenchmarkEngine.stop();
    }

    currentMetrics = {
      rps: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      replicationLagMs: 0,
      activeSuite: suite
    };

    activeBenchmarkEngine = new BenchmarkEngine((m) => {
      currentMetrics = m;
    });

    logAuditEvent('⚡ Lancement Benchmark \'' + suite + '\' (Durée: ' + duration + 's, Concurrence: ' + concurrency + ').');
    activeBenchmarkEngine.runSuite(suite, duration, concurrency).catch(console.error);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'started', suite, duration, concurrency }));
    return;
  }

  if (pathname === '/api/benchmark/stop') {
    if (activeBenchmarkEngine) {
      activeBenchmarkEngine.stop();
    }
    currentMetrics.activeSuite = 'idle';
    currentMetrics.rps = 0;
    logAuditEvent('🛑 Benchmark arrêté.');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'stopped' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MAGI Infra - Chaos Studio & Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Doto:wght@900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #f4f4f6;
      color: #0f172a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 24px;
    }
    .container {
      width: 100%;
      max-width: 1100px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .section-title {
      font-family: 'Doto', sans-serif;
      font-weight: 900;
      font-size: 20px;
      letter-spacing: -0.5px;
      text-transform: uppercase;
      color: #0f172a;
    }
    .bento-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .bento-card {
      background: #ffffff;
      border-radius: 20px;
      padding: 22px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .span-2 { grid-column: span 2; }
    .span-4 { grid-column: span 4; }

    .card-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 6px;
    }
    .pixel-title {
      font-family: 'Doto', sans-serif;
      font-weight: 900;
      font-size: 24px;
      letter-spacing: -0.5px;
      text-transform: uppercase;
      color: #0f172a;
      line-height: 1.1;
    }
    .role-text {
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
      margin-top: 2px;
    }
    .metric-value {
      font-family: 'Doto', sans-serif;
      font-weight: 900;
      font-size: 38px;
      color: #0f172a;
      line-height: 1;
      margin: 10px 0 4px 0;
    }
    .metric-unit {
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
      margin-left: 4px;
    }

    /* Status Badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 10px;
      font-family: 'Doto', sans-serif;
      font-weight: 900;
      font-size: 12px;
    }
    .status-badge.up {
      background: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }
    .status-badge.down {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .status-badge.up .dot { background: #16a34a; box-shadow: 0 0 6px #22c55e; }
    .status-badge.down .dot { background: #dc2626; }

    /* Control Panel */
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .btn-suite {
      background: #f1f5f9;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 8px 14px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-suite:hover {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }
    .btn-chaos {
      background: #fff7ed;
      color: #c2410c;
      border-color: #ffedd5;
    }
    .btn-chaos:hover {
      background: #ea580c;
      color: #ffffff;
    }
    .btn-backup {
      background: #eff6ff;
      color: #2563eb;
      border-color: #bfdbfe;
    }
    .btn-backup:hover {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-stop {
      background: #fef2f2;
      color: #dc2626;
      border-color: #fecaca;
    }
    .btn-stop:hover {
      background: #dc2626;
      color: #ffffff;
    }

    .hardware-info {
      display: flex;
      justify-content: space-between;
      margin-top: 14px;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 10px;
    }

    .audit-log-box {
      background: #0f172a;
      color: #38bdf8;
      font-family: monospace;
      font-size: 12px;
      padding: 14px;
      border-radius: 12px;
      height: 160px;
      overflow-y: auto;
      margin-top: 12px;
      white-space: pre-wrap;
    }

    .chart-container {
      width: 100%;
      height: 240px;
      margin-top: 14px;
      position: relative;
    }

    @media (max-width: 900px) {
      .bento-grid { grid-template-columns: repeat(2, 1fr); }
      .span-4 { grid-column: span 2; }
    }
    @media (max-width: 550px) {
      .bento-grid { grid-template-columns: 1fr; }
      .span-2, .span-4 { grid-column: span 1; }
    }
  </style>
</head>
<body>

  <div class="container">
    
    <!-- SECTION 1: STATUS -->
    <div>
      <div class="section-header">
        <div class="section-title">SYSTEM CLUSTER STATUS</div>
        <div id="watchdog-toggle-badge" class="status-badge down" style="cursor:pointer;" onclick="toggleWatchdogClient()">
          <span class="dot"></span>
          <span id="watchdog-status-text">WATCHDOG OFF</span>
        </div>
      </div>
      <div class="bento-grid" id="container-grid">
        <!-- Injected via SSE -->
      </div>
    </div>

    <!-- SECTION 2: CHAOS ENGINEERING & DISASTER SIMULATOR -->
    <div>
      <div class="section-header">
        <div class="section-title">🔥 DISASTER SIMULATOR & CHAOS CONTROL</div>
      </div>

      <div class="bento-grid">
        <div class="bento-card span-2">
          <div>
            <div class="card-label">CHAOS SIMULATION</div>
            <div class="pixel-title">KILL PRIMARY NODE</div>
            <div class="role-text">Simulez des pannes courtes ou prolongées de Melchior</div>
          </div>
          <div class="btn-group">
            <button class="btn-suite btn-chaos" onclick="killNode('melchior', 0)">💣 KILL NOW</button>
            <button class="btn-suite btn-chaos" onclick="killNode('melchior', 60)">⏱️ KILL 1 MIN</button>
            <button class="btn-suite btn-chaos" onclick="killNode('melchior', 300)">⏱️ KILL 5 MIN</button>
            <button class="btn-suite btn-chaos" onclick="killNode('melchior', 1200)">⏱️ KILL 20 MIN</button>
            <button class="btn-suite" onclick="restartNode('melchior')">🔄 RESTORE MELCHIOR</button>
          </div>
        </div>

        <div class="bento-card span-2">
          <div>
            <div class="card-label">FAILOVER CONTROLLER</div>
            <div class="pixel-title">FAILOVER & REPLICAS CHAOS</div>
            <div class="role-text">Promouvez une réplique ou tuez les serveurs de lecture</div>
          </div>
          <div class="btn-group">
            <button class="btn-suite btn-backup" onclick="promoteReplica('balthasar')">🚀 PROMOTE BALTHASAR</button>
            <button class="btn-suite btn-backup" onclick="promoteReplica('casper')">🚀 PROMOTE CASPER</button>
            <button class="btn-suite btn-stop" onclick="killNode('balthasar', 0)">💥 KILL REPLICA 1</button>
            <button class="btn-suite btn-stop" onclick="killNode('casper', 0)">💥 KILL REPLICA 2</button>
            <button class="btn-suite" onclick="restartNode('balthasar'); restartNode('casper');">🔄 RESTORE REPLICAS</button>
          </div>
        </div>

        <!-- AUDIT LOG FEED -->
        <div class="bento-card span-4">
          <div>
            <div class="card-label">LIVE LOGS</div>
            <div class="pixel-title">CHAOS & WATCHDOG AUDIT FEED</div>
          </div>
          <div class="audit-log-box" id="audit-log-content">Initializing audit log stream...</div>
        </div>
      </div>
    </div>

    <!-- SECTION 3: BENCHMARK & PERFORMANCE -->
    <div>
      <div class="section-header">
        <div class="section-title">BENCHMARK & PERFORMANCE TEST</div>
        <div id="active-suite-badge" class="status-badge up">
          <span class="dot"></span>
          <span id="suite-status-text">READY</span>
        </div>
      </div>

      <div class="bento-grid">
        <!-- BENCHMARK CONTROLLER -->
        <div class="bento-card span-4">
          <div>
            <div class="card-label">BENCHMARK RUNNER</div>
            <div class="pixel-title">LOAD SUITE EXECUTION</div>
          </div>
          <div class="btn-group">
            <button class="btn-suite" onclick="startSuite('suite1_baseline', 30, 20)">BASELINE</button>
            <button class="btn-suite" onclick="startSuite('suite2_ramping', 30, 50)">RAMPING LOAD</button>
            <button class="btn-suite" onclick="startSuite('suite3_soak', 30, 50)">REDIS SOAK</button>
            <button class="btn-suite" onclick="startSuite('suite4_chaos', 30, 60)">CHAOS LOAD TEST</button>
            <button class="btn-suite btn-backup" onclick="triggerBackup()">BACKUP TO S3</button>
            <button class="btn-suite btn-stop" onclick="stopBenchmark()">STOP BENCHMARK</button>
          </div>
        </div>

        <!-- BENCHMARK METRICS -->
        <div class="bento-card">
          <div class="card-label">THROUGHPUT</div>
          <div class="metric-value" id="val-rps">0<span class="metric-unit">RPS</span></div>
          <div style="font-size:11px; color:#64748b;" id="val-total">Total: 0</div>
        </div>

        <div class="bento-card">
          <div class="card-label">LATENCY P95</div>
          <div class="metric-value" id="val-p95">0.0<span class="metric-unit">ms</span></div>
          <div style="font-size:11px; color:#64748b;" id="val-lat-details">p50: 0ms | p99: 0ms</div>
        </div>

        <div class="bento-card">
          <div class="card-label">REPLICATION LAG</div>
          <div class="metric-value" id="val-lag">0<span class="metric-unit">ms</span></div>
          <div style="font-size:11px; color:#64748b;">Primary ➔ Replicas</div>
        </div>

        <div class="bento-card">
          <div class="card-label">ERROR RATE</div>
          <div class="metric-value" id="val-errors">0<span class="metric-unit">err</span></div>
          <div style="font-size:11px; color:#64748b;" id="val-success">Success: 100%</div>
        </div>

        <!-- REALTIME GRAPH BENTO BLOCK -->
        <div class="bento-card span-4">
          <div>
            <div class="card-label">REALTIME GRAPH</div>
            <div class="pixel-title">THROUGHPUT & LATENCY METRICS</div>
          </div>
          <div class="chart-container">
            <canvas id="realtimeChart"></canvas>
          </div>
        </div>

      </div>
    </div>

  </div>

  <script>
    const SIMPLE_NAMES = {
      'melchior': { name: 'DB WRITE', role: 'PostgreSQL Master', span: 'span-2' },
      'balthasar': { name: 'DB READ 01', role: 'PostgreSQL Replica', span: '' },
      'casper': { name: 'DB READ 02', role: 'PostgreSQL Replica', span: '' },
      'pgbouncer': { name: 'POOLER', role: 'PgBouncer Pooler', span: 'span-2' },
      'redis': { name: 'CACHE', role: 'In-Memory Store', span: 'span-2' },
      'haproxy': { name: 'GATEWAY', role: 'Load Balancer', span: 'span-2' },
      'minio': { name: 'STORAGE', role: 'Object Store', span: '' },
      'adminer': { name: 'STUDIO', role: 'DB Manager', span: '' }
    };

    let watchdogState = false;

    function killNode(node, duration) {
      fetch('/api/chaos/kill?node=' + node + '&duration=' + duration);
    }

    function restartNode(node) {
      fetch('/api/chaos/restart?node=' + node);
    }

    function promoteReplica(target) {
      fetch('/api/chaos/promote?target=' + target);
    }

    function toggleWatchdogClient() {
      watchdogState = !watchdogState;
      fetch('/api/chaos/watchdog?enable=' + watchdogState);
    }

    function startSuite(suite, duration, concurrency) {
      fetch('/api/benchmark/start?suite=' + suite + '&duration=' + duration + '&concurrency=' + concurrency);
    }

    function stopBenchmark() {
      fetch('/api/benchmark/stop');
    }

    function triggerBackup() {
      const badgeText = document.getElementById('suite-status-text');
      badgeText.innerText = 'BACKUP IN PROGRESS...';
      fetch('/api/backup')
        .then(res => res.json())
        .then(data => {
          alert('Sauvegarde S3 MinIO effectuée avec succès !');
          badgeText.innerText = 'READY';
        })
        .catch(err => {
          alert('Erreur lors de la sauvegarde : ' + err.message);
          badgeText.innerText = 'READY';
        });
    }

    // Chart.js Setup
    const ctx = document.getElementById('realtimeChart').getContext('2d');
    const maxDataPoints = 35;
    const chartLabels = Array(maxDataPoints).fill('');
    const rpsData = Array(maxDataPoints).fill(0);
    const latencyData = Array(maxDataPoints).fill(0);

    const realtimeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'THROUGHPUT (RPS)',
            data: rpsData,
            borderColor: '#0f172a',
            backgroundColor: 'rgba(15, 23, 42, 0.04)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'LATENCY P95 (ms)',
            data: latencyData,
            borderColor: '#dc2626',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            borderDash: [4, 4],
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          x: { display: false },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: 'rgba(0, 0, 0, 0.04)' },
            ticks: { font: { family: 'Inter', size: 11 } }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { font: { family: 'Inter', size: 11 } }
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              font: { family: 'Inter', weight: '600', size: 11 },
              boxWidth: 12
            }
          }
        }
      }
    });

    // Connexion SSE
    const evtSource = new EventSource('/api/stream');

    evtSource.onmessage = function(e) {
      const data = JSON.parse(e.data);

      if (data.watchdogActive !== undefined) {
        watchdogState = data.watchdogActive;
        const wdBadge = document.getElementById('watchdog-toggle-badge');
        const wdText = document.getElementById('watchdog-status-text');
        if (watchdogState) {
          wdBadge.className = 'status-badge up';
          wdText.innerText = 'WATCHDOG ACTIVE';
        } else {
          wdBadge.className = 'status-badge down';
          wdText.innerText = 'WATCHDOG OFF';
        }
      }

      if (data.auditLogs) {
        const logBox = document.getElementById('audit-log-content');
        logBox.innerText = data.auditLogs.join('\n');
      }

      if (data.benchmark) {
        const bm = data.benchmark;
        document.getElementById('val-rps').innerHTML = bm.rps + '<span class="metric-unit">RPS</span>';
        document.getElementById('val-total').innerText = 'Total: ' + bm.totalRequests;
        
        document.getElementById('val-p95').innerHTML = bm.p95 + '<span class="metric-unit">ms</span>';
        document.getElementById('val-lat-details').innerText = 'p50: ' + bm.p50 + 'ms | p99: ' + bm.p99 + 'ms';

        document.getElementById('val-lag').innerHTML = bm.replicationLagMs + '<span class="metric-unit">ms</span>';
        document.getElementById('val-errors').innerHTML = bm.failedRequests + '<span class="metric-unit">err</span>';
        
        const successRate = bm.totalRequests > 0 ? ((bm.successfulRequests / bm.totalRequests) * 100).toFixed(1) : 100;
        document.getElementById('val-success').innerText = 'Success: ' + successRate + '%';

        const badge = document.getElementById('active-suite-badge');
        const badgeText = document.getElementById('suite-status-text');
        if (bm.activeSuite && bm.activeSuite !== 'idle' && bm.activeSuite !== 'completed' && bm.activeSuite !== 'stopped') {
          badge.className = 'status-badge up';
          badgeText.innerText = bm.activeSuite.replace('_', ' ').toUpperCase();
        }
      }

      if (data.containers) {
        const grid = document.getElementById('container-grid');
        grid.innerHTML = data.containers.map(function(c) {
          const isUp = c.state === 'running';
          const meta = SIMPLE_NAMES[c.name] || { name: c.name.toUpperCase(), role: c.role, span: '' };
          
          return '<div class="bento-card ' + meta.span + '">' +
            '<div>' +
              '<div class="pixel-title">' + meta.name + '</div>' +
              '<div class="role-text">' + meta.role + '</div>' +
            '</div>' +
            '<div>' +
              '<div class="hardware-info">' +
                '<span>CPU: ' + c.cpu + '</span>' +
                '<span>RAM: ' + c.mem + '</span>' +
              '</div>' +
              '<div style="margin-top: 12px; display:flex; justify-content:space-between; align-items:center;">' +
                '<span style="font-size:11px; color:#94a3b8;">' + c.status + '</span>' +
                '<span class="status-badge ' + (isUp ? 'up' : 'down') + '">' +
                  '<span class="dot"></span>' +
                  (isUp ? 'ONLINE' : 'OFFLINE') +
                '</span>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    };
  </script>
</body>
</html>
  `);
});

const certPath = path.join(__dirname, '../../infra/certs/server.crt');
const keyPath = path.join(__dirname, '../../infra/certs/server.key');

const tls = require('tls');

let appServer = server;
let isHttps = false;

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);
    appServer = https.createServer({ key, cert }, server.listeners('request')[0]);
    isHttps = true;
  } catch (err) {
    console.error('⚠️ Notice: TLS certs loading error:', err.message);
  }
}

let currentPort = PORT;

appServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️ Port ${currentPort} occupé, tentative sur le port ${currentPort + 1}...`);
    currentPort++;
    if (currentPort - PORT > 10) {
      console.error(`❌ Impossible de trouver un port libre après 10 tentatives.`);
      process.exit(1);
    }
    appServer.listen(currentPort);
  } else {
    console.error(err);
  }
});

appServer.listen(currentPort, () => {
  const portFilePath = path.join(__dirname, '../../.dashboard.port');
  fs.writeFileSync(portFilePath, currentPort.toString(), 'utf8');
  
  console.log(`=================================================================`);
  console.log(`🚀 MAGI Control Center running on port ${currentPort}:`);
  if (isHttps) {
    console.log(`   - HTTPS : https://localhost:${currentPort}`);
  } else {
    console.log(`   - HTTP  : http://localhost:${currentPort}`);
  }
  console.log(`=================================================================`);
});
