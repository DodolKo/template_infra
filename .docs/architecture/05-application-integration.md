# Intégration d'Applications (AdonisJS, Rust, NextJS) & Bonnes Pratiques DB

Ce guide explique comment brancher une API ou un frontend sur l'infrastructure HA sans modifier la topologie du cluster.

---

## 1. Sécurité des Migrations Database & Prévention des Pannes Dokploy

### ⚠️ Le problème classique des migrations au boot :
Exécuter `node ace migration:run` directement dans le script d'entrée (`entrypoint` Docker) d'une application en production comporte des risques :
- Si la migration échoue (ex: syntaxe SQL erronée, lock de table), le conteneur crash.
- Dokploy essaie de redémarrer le conteneur en boucle (`CrashLoopBackOff`), ce qui peut impacter le reste du déploiement.

### ✅ La bonne pratique (Workflow Sécurisé) :
1. **Validation en BETA** : Exécuter la migration d'abord sur l'environnement BETA/Staging.
2. **Migrations Transactionnelles** : AdonisJS englobe les migrations dans des transactions PostgreSQL. Si une étape échoue, un `ROLLBACK` automatique survient et la base reste intacte.
3. **Pre-Deploy Command** : Dans Dokploy, exécuter la migration sous forme de **Pre-deploy job** (ou via le workflow CI/CD GitHub Actions) plutôt que dans la commande de démarrage de l'API.

---

## 2. Snippet d'Intégration AdonisJS (Lucid ORM)

Dans le fichier `config/database.ts` de votre projet AdonisJS :

```typescript
import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      connection: {
        host: env.get('DB_WRITE_HOST', 'haproxy'),
        port: Number(env.get('DB_WRITE_PORT', 5000)),
        user: env.get('DB_USER', 'root'),
        password: env.get('DB_PASSWORD', 'root'),
        database: env.get('DB_NAME', 'app_db'),
      },
      replicas: {
        write: {
          host: env.get('DB_WRITE_HOST', 'haproxy'),
          port: Number(env.get('DB_WRITE_PORT', 5000)),
        },
        read: [
          {
            host: env.get('DB_READ_HOST', 'haproxy'),
            port: Number(env.get('DB_READ_PORT', 5001)),
          }
        ]
      },
      pool: { min: 2, max: 20 }
    }
  }
})

export default dbConfig
```

---

## 3. Snippet d'Intégration Redis

```typescript
// config/redis.ts dans AdonisJS
import env from '#start/env'
import { defineConfig } from '@adonisjs/redis'

export default defineConfig({
  connection: 'main',
  connections: {
    main: {
      host: env.get('REDIS_HOST', 'redis'),
      port: Number(env.get('REDIS_PORT', 6379)),
      password: env.get('REDIS_PASSWORD', 'redis_secret_password'),
    }
  }
})
```

---

## 4. Snippet d'Intégration MinIO Object Storage (S3)

Configuration S3 pour AdonisJS Drive ou SDK `@aws-sdk/client-s3` (NextJS / Rust) :

- **Endpoint (Internal Docker)** : `http://minio:9000`
- **Endpoint (Host / Web)** : `http://localhost:9002`
- **Access Key ID** : `minio_admin`
- **Secret Access Key** : `minio_secret_password`
- **Region** : `us-east-1` (ou `main`)
- **Force Path Style** : `true`

---

## 5. Matrice des Points d'Accès pour une API externe

| Service | Hôte Interne (Docker) | Port | Hôte Externe (Mac / Host) | Port | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Écritures DB** | `haproxy` | `5000` | `localhost` | `5005` | Master Melchior |
| **Lectures DB** | `haproxy` | `5001` | `localhost` | `5006` | Replicas (Load Balanced) |
| **Pooler Direct** | `pgbouncer` | `6432` | `localhost` | `6432` | Master via PgBouncer |
| **Cache Redis** | `redis` | `6379` | `localhost` | `6380` | Cache In-Memory |
| **MinIO S3** | `minio` | `9000` | `localhost` | `9002` | API S3 |
