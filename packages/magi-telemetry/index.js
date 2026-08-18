/**
 * 📡 MAGI Telemetry SDK
 * Module universel zéro-dépendance pour envoyer des métriques et événements
 * depuis n'importe quel projet (Adonis, Express, Fastify, React, Vue, Next.js, Vanilla JS)
 * vers le MAGI Control Center (http://localhost:3010).
 */

class MagiTelemetry {
  constructor(options = {}) {
    this.endpoint = options.endpoint || 'http://localhost:3010/api/telemetry';
    this.appName = options.appName || 'app-client';
    this.enabled = options.enabled !== undefined ? options.enabled : true;
  }

  async send(event, data = {}) {
    if (!this.enabled) return;

    const payload = {
      appName: this.appName,
      event,
      data,
      timestamp: new Date().toISOString()
    };

    try {
      if (typeof window !== 'undefined' && window.fetch) {
        // Client-side Browser
        fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } else {
        // Node.js Backend
        const http = require('http');
        const url = new URL(this.endpoint);
        const req = http.request(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        req.on('error', () => {});
        req.write(JSON.stringify(payload));
        req.end();
      }
    } catch (err) {
      // Silent catch to prevent crashing client apps
    }
  }

  // Middleware Express / Adonis / Fastify helper
  middleware() {
    return (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.send('HTTP_REQUEST', {
          method: req.method,
          url: req.originalUrl || req.url,
          status: res.statusCode,
          durationMs: duration
        });
      });
      if (next) next();
    };
  }
}

module.exports = MagiTelemetry;
