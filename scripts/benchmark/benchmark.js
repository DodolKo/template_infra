const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { loadEnv } = require('../../tools/dashboard/env-loader');

const env = loadEnv();

const CONFIG = {
  dbUser: env.POSTGRES_USER || 'postgres_admin',
  dbPassword: env.POSTGRES_PASSWORD || 'postrgres_secret_password',
  dbName: env.POSTGRES_DB || 'app_db',
  writePort: parseInt(env.HAPROXY_WRITE_PORT || 5000, 10),
  readPort: parseInt(env.HAPROXY_READ_PORT || 5001, 10),
  redisPort: parseInt(env.REDIS_PORT || 6379, 10),
  redisPassword: env.REDIS_PASSWORD || 'redis_secret_password'
};

class BenchmarkEngine {
  constructor(onMetricsCallback) {
    this.onMetrics = onMetricsCallback || (() => {});
    this.running = false;
    this.writePool = null;
    this.readPool = null;
    this.redisClient = null;
    this.stats = {
      rps: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      latencies: [],
      p50: 0,
      p95: 0,
      p99: 0,
      replicationLagMs: 0,
      activeSuite: 'idle'
    };
  }

  async initClients() {
    this.writePool = new Pool({
      user: CONFIG.dbUser,
      host: 'localhost',
      database: CONFIG.dbName,
      password: CONFIG.dbPassword,
      port: CONFIG.writePort,
      max: 20,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 3000
    });

    this.readPool = new Pool({
      user: CONFIG.dbUser,
      host: 'localhost',
      database: CONFIG.dbName,
      password: CONFIG.dbPassword,
      port: CONFIG.readPort,
      max: 30,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 3000
    });

    this.redisClient = new Redis({
      host: 'localhost',
      port: CONFIG.redisPort,
      password: CONFIG.redisPassword,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000
    });

    try {
      await this.redisClient.connect();
    } catch (e) {
      console.error('Redis connection warning:', e.message);
    }

    // S'assurer que la table de benchmark existe sur la DB master
    try {
      await this.writePool.query(`
        CREATE TABLE IF NOT EXISTS benchmark_logs (
          id SERIAL PRIMARY KEY,
          payload TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {
      console.error('PG Init warning:', e.message);
    }
  }

  calculatePercentiles() {
    if (this.stats.latencies.length === 0) return;
    const sorted = [...this.stats.latencies].sort((a, b) => a - b);
    const getP = (p) => sorted[Math.floor(sorted.length * p)] || 0;
    this.stats.p50 = parseFloat(getP(0.50).toFixed(2));
    this.stats.p95 = parseFloat(getP(0.95).toFixed(2));
    this.stats.p99 = parseFloat(getP(0.99).toFixed(2));
  }

  async measureReplicationLag() {
    try {
      const testVal = `lag_test_${Date.now()}_${Math.random()}`;
      const start = Date.now();
      await this.writePool.query('INSERT INTO benchmark_logs(payload) VALUES($1)', [testVal]);

      let replicated = false;
      let attempts = 0;
      while (!replicated && attempts < 20) {
        attempts++;
        const res = await this.readPool.query('SELECT payload FROM benchmark_logs WHERE payload = $1 LIMIT 1', [testVal]);
        if (res.rows.length > 0) {
          replicated = true;
          this.stats.replicationLagMs = Date.now() - start;
          break;
        }
        await new Promise(r => setTimeout(r, 10));
      }
      if (!replicated) {
        this.stats.replicationLagMs = 200; // Timeout
      }
    } catch (e) {
      this.stats.replicationLagMs = -1;
    }
  }

  async runSuite(suiteId, durationSec = 15, concurrency = 20) {
    if (this.running) return;
    this.running = true;
    this.stats.activeSuite = suiteId;
    await this.initClients();

    let requestWindow = 0;
    let windowStartTime = Date.now();

    const intervalTimer = setInterval(async () => {
      const now = Date.now();
      const elapsedSec = (now - windowStartTime) / 1000;
      this.stats.rps = Math.round(requestWindow / elapsedSec);
      this.calculatePercentiles();
      await this.measureReplicationLag();

      // Callback dashboard
      this.onMetrics({ ...this.stats });

      // Reset window
      requestWindow = 0;
      windowStartTime = Date.now();
      this.stats.latencies = []; // Vider la fenêtre glissante pour rester dynamique
    }, 1000);

    const endTime = Date.now() + (durationSec * 1000);

    const worker = async () => {
      while (Date.now() < endTime && this.running) {
        const start = performance.now();
        try {
          if (suiteId === 'suite1_baseline') {
            // Lecture Read Replica via HAProxy
            await this.readPool.query('SELECT NOW()');
          } else if (suiteId === 'suite2_ramping') {
            // Mix Écriture & Lecture intense
            if (Math.random() > 0.3) {
              await this.readPool.query('SELECT * FROM benchmark_logs ORDER BY id DESC LIMIT 5');
            } else {
              await this.writePool.query('INSERT INTO benchmark_logs(payload) VALUES($1)', [`ramping_${Math.random()}`]);
            }
          } else if (suiteId === 'suite3_soak') {
            // Stress Redis Cache In-Memory + Eviction
            const key = `soak:${Math.floor(Math.random() * 10000)}`;
            await this.redisClient.set(key, 'X'.repeat(512), 'EX', 10);
            await this.redisClient.get(key);
          } else if (suiteId === 'suite4_chaos') {
            // Stress combiné SQL & Redis
            await Promise.all([
              this.readPool.query('SELECT 1'),
              this.redisClient.ping(),
              this.writePool.query('INSERT INTO benchmark_logs(payload) VALUES($1)', ['chaos'])
            ]);
          }

          const duration = performance.now() - start;
          this.stats.latencies.push(duration);
          if (this.stats.latencies.length > 2000) this.stats.latencies.shift();
          this.stats.successfulRequests++;
        } catch (err) {
          this.stats.failedRequests++;
        } finally {
          this.stats.totalRequests++;
          requestWindow++;
        }

        // Petite respiration micro-tâche
        await new Promise(r => setTimeout(r, 2));
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    clearInterval(intervalTimer);
    this.running = false;
    this.stats.activeSuite = 'completed';
    this.onMetrics({ ...this.stats });
    await this.close();
  }

  async stop() {
    this.running = false;
    this.stats.activeSuite = 'stopped';
    this.onMetrics({ ...this.stats });
    await this.close();
  }

  async close() {
    if (this.writePool) await this.writePool.end().catch(() => {});
    if (this.readPool) await this.readPool.end().catch(() => {});
    if (this.redisClient) await this.redisClient.quit().catch(() => {});
  }
}

// Support CLI direct
if (require.main === module) {
  const args = process.argv.slice(2);
  const suiteArg = args.find(a => a.startsWith('--suite='))?.split('=')[1] || 'suite1_baseline';
  const durationArg = parseInt(args.find(a => a.startsWith('--duration='))?.split('=')[1] || '10', 10);
  const concurrencyArg = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '15', 10);

  console.log(`🚀 Demarrage CLI Benchmark: ${suiteArg} (${durationArg}s, ${concurrencyArg} workers)`);
  const engine = new BenchmarkEngine((m) => {
    console.log(`[METRICS] RPS: ${m.rps} | Latency p50: ${m.p50}ms, p95: ${m.p95}ms, p99: ${m.p99}ms | Lag: ${m.replicationLagMs}ms | Errors: ${m.failedRequests}`);
  });

  engine.runSuite(suiteArg, durationArg, concurrencyArg).then(() => {
    console.log('✅ Benchmark termine avec succes !');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Erreur Benchmark:', err);
    process.exit(1);
  });
}

module.exports = BenchmarkEngine;
