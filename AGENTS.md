# Agent IA & Developer Guide - Infrastructure Architecture

Guide d'alignement et référence opérationnelle pour agents IA et développeurs.

---

## 1. Vue d'Ensemble & Mission

Infrastructure haute disponibilité containerisée via Docker Compose :
- Cluster **PostgreSQL MAGI** (`melchior` Primary, `balthasar` Replica 1, `casper` Replica 2) via réplication WAL.
- Connection pooler transactionnel **PgBouncer** (`:6432`).
- Load Balancer TCP **HAProxy** (Écritures `:5000`, Lectures `:5001`).
- Cache in-memory **Redis** (éviction LRU, persistance AOF).
- Object Storage compatible S3 **MinIO** (`:9000` API, `:9001` Console).
- Interface **Adminer** (`:8080`) et dashboard de monitoring custom (`:3010`).
- Stack de Monitoring optionnelle : **Prometheus** (`:9090`) + **Grafana** (`:3000`).

---

## 2. Kickstart Project (IA Onboarding)

Si un utilisateur vous demande de démarrer un nouveau projet (ex: Knotly.link 2.0, Cinegear, etc.) basé sur ce boilerplate, voici la marche à suivre :

1. **Exécuter le Wizard** : Lancez le script `./setup-project.sh` et répondez aux questions interactives selon les préférences de l'utilisateur (Génération des mots de passe sécurisés, structure Monorepo vs Standard).
2. **Architecture des Dossiers** :
   - Par défaut, utilisez les dossiers `apps/` (pour Next.js, React, etc.) et `packages/` (pour les paquets partagés) générés par le script.
   - La racine doit rester propre, réservée à l'infrastructure (`infra/`), Docker, et aux scripts de monitoring.
3. **Branchement MAGI** :
   - Configurez les ORM de l'application (ex: Prisma, Drizzle) pour utiliser :
     - Écritures : `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${HAPROXY_WRITE_PORT}/${POSTGRES_DB}`
     - Lectures : `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${HAPROXY_READ_PORT}/${POSTGRES_DB}`

---

## 3. Éligibilité au Déploiement (Deployment Matrix)

| Environnement / Cas d'Usage | Éligibilité | Note & Recommandation |
| :--- | :--- | :--- |
| **Serveur Dédié / VPS Unique (Hetzner, OVH, EC2, Droplet)** | ✅ **Déployable** | Parfait pour 10k-100k DAU. Exécution isolée via Compose ou Swarm. |
| **Staging / Dev Teams / Local Workstations** | ✅ **Déployable** | Simule 100% une architecture enterprise complexe sans coûts cloud. |
| **Edge / On-Premise (Datacenter privé)** | ✅ **Déployable** | Idéal pour environnements réglementés ou hors cloud public. |
| **AWS / GCP / Azure Managed PaaS** | ❌ **Non Recommandé** | Préférer AWS RDS Multi-AZ / Cloud SQL (sauvegardes & failover managés). |
| **Zero-Downtime Multi-DC Active-Active** | ❌ **Non Recommandé** | Préférer Patroni + Raft/Etcd + IP flottante sur 3 serveurs distants. |
| **Instances très réduites (< 4 Go RAM)** | ❌ **Non Recommandé** | La stack complète nécessite au moins 4 à 8 Go de RAM sous charge. |

---

## 4. Consignes & Règles d'Or pour Agents IA

1. **Isolation des réseaux & Noms de service** :
   - Communication via le réseau Docker `infra_network`.
   - Utiliser les alias de conteneurs (`melchior_db`, `balthasar_db`, `casper_db`, `redis`, `haproxy`, `pgbouncer`, `prometheus`, `grafana`).

2. **Séparation Écritures / Lectures** :
   - **Écritures (`INSERT`, `UPDATE`, `DELETE`, DDL)** : HAProxy port `5000` (ou `pgbouncer:6432` / `melchior_db:5432`).
   - **Lectures (`SELECT`)** : HAProxy port `5001` (équilibré entre `balthasar_db` et `casper_db`).

3. **Variables d'Environnement** :
   - Secrets et mots de passe toujours référencés via `.env`. Le `.env.example` sert de base.

4. **Orchestration & CLI (AUCUNE COMMANDE NI SCRIPT EXCLUSIF IA)** :
   - L'Agent IA utilise **strictement et exclusivement** les mêmes commandes standard du `Makefile` que tout développeur humain (`make up`, `make status`, `make test`, `make monitoring`, `make down`, `make help`).
   - **INTERDICTION STRICTE DE CRÉER OU D'UTILISER DES SCRIPTS OU COMMANDES CUSTOM DÉDIÉS À L'IA** : L'IA ne dispose d'aucune commande ni script exclusif. Toute gestion, démarrage ou vérification de l'infrastructure se fait en utilisant l'outillage global du projet.

5. **Sécurité & Intégrité de la Machine Hôte (INTERDICTION STRICTE DE SUDO ET CONTOURNEMENT SYSTEME)** :
   - L'Agent IA a l'**INTERDICTION STRICTE** d'essayer d'exécuter automatiquement des commandes nécessitant des privilèges root/administrateur (`sudo`), de modifier les fichiers système de la machine hôte (ex: `/etc/hosts`, trousseaux de clés Keychain macOS) ou de chercher des bricolages/contournements de ports système.
   - Toute modification de la machine hôte est considérée comme une violation d'intégrité si elle est tentée automatiquement par l'IA. L'Agent IA doit **IMPÉRATIVEMENT guider l'utilisateur en lui fournissant la liste exacte des commandes** à lancer lui-même dans son terminal.

---

## 5. Matrice des Ports & Services

| Service | Host Port | Container Port | Rôle / Usage |
| :--- | :--- | :--- | :--- |
| **HAProxy (Write)** | `5000` | `5000` | Point d'entrée Écritures (-> Melchior) |
| **HAProxy (Read)** | `5001` | `5001` | Point d'entrée Lectures (-> Balthasar/Casper) |
| **HAProxy Stats** | `7000` | `7000` | Dashboard Web métriques HAProxy |
| **PgBouncer** | `6432` | `6432` | Connection Pooler (Transaction mode) |
| **Melchior DB** | `5432` | `5432` | PostgreSQL Primary Node |
| **Balthasar DB** | `5433` | `5432` | PostgreSQL Read Replica 1 |
| **Casper DB** | `5434` | `5432` | PostgreSQL Read Replica 2 |
| **Redis** | `6379` | `6379` | Cache In-Memory |
| **MinIO API** | `9000` | `9000` | S3 API Endpoint |
| **MinIO Console** | `9001` | `9001` | Dashboard Web MinIO |
| **Adminer** | `8080` | `8080` | Client Web de gestion SQL |
| **Dashboard Custom** | `3010` | `3010` | Dashboard TUI/Web Node.js |
| **Prometheus** | `9090` | `9090` | Collecteur de Métriques Infra |
| **Grafana** | `3000` | `3000` | Tableau de bord de visibilité Grafana |
| **Postgres Exporter**| `9187` | `9187` | Métriques PostgreSQL |
| **Redis Exporter** | `9121` | `9121` | Métriques Redis |
