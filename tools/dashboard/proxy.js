const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT_FILE = path.join(__dirname, '../../.dashboard.port');

function getDashboardPort() {
  if (fs.existsSync(PORT_FILE)) {
    return parseInt(fs.readFileSync(PORT_FILE, 'utf8').trim(), 10) || 3010;
  }
  return 3010;
}

const proxy = net.createServer((clientSocket) => {
  const targetPort = getDashboardPort();
  
  const serverSocket = net.connect({ port: targetPort, host: '127.0.0.1' }, () => {
    clientSocket.pipe(serverSocket);
    serverSocket.pipe(clientSocket);
  });

  serverSocket.on('error', (err) => {
    console.error(`⚠️ Proxy TCP: Impossible de joindre le dashboard sur 127.0.0.1:${targetPort}. Assurez-vous d'avoir lancé 'make dashboard' dans un autre terminal !`);
    clientSocket.destroy();
  });

  clientSocket.on('error', (err) => {
    serverSocket.destroy();
  });
});

// VERY IMPORTANT: Bind STRICTLY to 127.0.0.1 to prevent external network access!
proxy.listen(443, '127.0.0.1', () => {
  console.log('=================================================================');
  console.log('🛡️  Secure TCP Proxy started on 127.0.0.1:443');
  console.log(`📡 Forwarding traffic to dashboard at 127.0.0.1:${getDashboardPort()}`);
  console.log('⚠️  This proxy is strictly bound to localhost for security.');
  console.log('=================================================================');
  
  // Write PID file for the Makefile to kill it later
  fs.writeFileSync(path.join(__dirname, '../../.proxy.pid'), process.pid.toString());
});

proxy.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error('❌ EACCES: You must run this script with sudo to bind to port 443.');
    process.exit(1);
  } else if (err.code === 'EADDRINUSE') {
    console.error('❌ EADDRINUSE: Port 443 is already in use by another process.');
    process.exit(1);
  } else {
    console.error(err);
  }
});

// Clean shutdown on Ctrl+C (SIGINT) or SIGTERM
let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🛑 Interruption détectée (Ctrl+C). Arrêt du Proxy TCP sécurisé...');
  proxy.close(() => {
    console.log('✅ Proxy arrêté avec succès.');
    try {
      const pidPath = path.join(__dirname, '../../.proxy.pid');
      if (fs.existsSync(pidPath)) {
        fs.unlinkSync(pidPath);
      }
    } catch(e) {}
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
