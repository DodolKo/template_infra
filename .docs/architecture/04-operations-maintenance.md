# Opérations, Maintenance, Monitoring & Disaster Recovery

Procédures opérationnelles, Makefile, stack d'observabilité Prometheus/Grafana et procédures de secours (Failover).

---

## 1. Unified Command CLI (`Makefile`)

L'administration quotidienne s'effectue via le `Makefile` unifié :

```bash
make up          # Démarrer la stack d'infrastructure de base
make monitoring  # Démarrer avec Prometheus (9090) & Grafana (3000)
make status      # Vérifier l'état et les ports des conteneurs
make test        # Exécuter les tests de réplication et load balancing
make dashboard   # Lancer le dashboard custom Node.js / Terminal
make failover    # Exécuter le script de bascule d'urgence
make backup      # Effectuer une sauvegarde logique PostgreSQL
make clean       # Arrêter et supprimer conteneurs & volumes
```

---

## 2. Monitoring & Visualisation (Prometheus & Grafana)

Pour démarrer la stack complète avec monitoring :
```bash
./scripts/setup-monitoring.sh
# Ou
make monitoring
```

- **Grafana** : `http://localhost:3000` (User: `admin`, Password: `admin`)
  - Tableau de bord pré-configuré : *Infrastructure MAGI Overview* (Santé DB, connexions, mémoire Redis).
- **Prometheus** : `http://localhost:9090` (Scrape les métriques Postgres, Redis & HAProxy).
- **Dashboard Custom Node.js** : `http://localhost:3010` ou CLI (`make dashboard`).

---

## 3. Disaster Recovery & Emergency Failover

En cas de crash irrécupérable du Primary (`melchior`) :

1. **Promotion d'urgence d'un Replica (`balthasar` ou `casper`)** :
   ```bash
   make failover
   # Ou directement
   ./scripts/failover-promote.sh balthasar
   ```
2. Le script va promouvoir `balthasar` en nouveau Master PostgreSQL via `pg_ctl promote`.
3. Mettre à jour l'alias de service dans `pgbouncer` et ré-orienter le trafic d'écriture.

---

## 4. Outils d'Administration GUI

- **Grafana Metrics** : `http://localhost:3000`
- **Prometheus Collector** : `http://localhost:9090`
- **Adminer SQL Web** : `http://localhost:8080` (Host: `haproxy:5000` ou `pgbouncer:6432`).
- **HAProxy Stats** : `http://localhost:7000` (`admin` / `adminpass`).
- **Console MinIO S3** : `http://localhost:9001` (`minio_admin` / `minio_secret_password`).

---

## 5. Intégration Continue (CI/CD Pipeline)

Un workflow `.github/workflows/infra-ci.yml` est pré-configuré pour :
1. Démarrer automatiquement la stack sur GitHub Actions.
2. Attendre que le master PostgreSQL réponde au healthcheck.
3. Exécuter `./scripts/test-replication.sh` et `./scripts/test-loadbalance.sh`.
