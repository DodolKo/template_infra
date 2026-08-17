# Couche Cache Redis & Object Storage MinIO

Composants de stockage in-memory et d'objets S3.

---

## 1. Redis Cache & Storage In-Memory

- Image : `redis:7-alpine`
- Port : `6379` (password protected via `${REDIS_PASSWORD}`)
- Politique d'éviction : `allkeys-lru`
- Limite mémoire : `512MB`
- Persistance : `appendonly yes`

### Usages Recommandés
- Cache de requêtes SQL coûteuses.
- Sessions utilisateurs / Jetons JWT.
- Rate limiting et verrous distribués.

---

## 2. Stockage d'Objets MinIO (S3 Compatible)

- Image : `minio/minio:latest`
- Ports :
  - `9000` : Endpoint API S3
  - `9001` : Console Web d'administration (`http://localhost:9001`)
- Credentials : `${MINIO_USER}` / `${MINIO_PASSWORD}`.

---

## 3. Directives pour Agents IA

1. Client Redis : Authentification obligatoire via mot de passe.
2. SDK S3 MinIO :
   - `endpoint`: `http://minio:9000` (Docker) ou `http://localhost:9000` (Hôte).
   - `s3ForcePathStyle`: `true`.
