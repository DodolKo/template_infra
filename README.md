# 🚀 Scalable Infrastructure Architecture & Chaos Sandbox

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![HAProxy](https://img.shields.io/badge/HAProxy-000000?style=for-the-badge&logo=haproxy&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![NodeJS](https://img.shields.io/badge/NodeJS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/Status-Sandbox_Experimental-orange?style=for-the-badge)

> [!WARNING]
> **⚠️ AVERTISSEMENT IMPORTANT - UTILISATION EN PRODUCTION**
> 
> **Ce projet est actuellement un environnement de test, de prototypage et de Chaos Engineering.**
> En l'état actuel (et jusqu'à nouvel ordre explicite), **ce dépôt N'EST PAS une base saine ni recommandée pour un déploiement direct en production**.
> 
> Plusieurs points d'architecture et de durcissement restent à corriger et à valider avant tout usage en environnement critique :
> - 🔒 **Gestion des Secrets & Sécurité** : Migration des secrets `.env` locaux vers un gestionnaire de clés/secrets (Vault / AWS Secrets Manager).
> - 📜 **Certificats SSL/TLS** : Utilisation de certificats de production validés (ACME/Let's Encrypt) au lieu de certs auto-signés locaux.
> - 🌐 **Failover Inter-DC & Orchestration** : Mise en place d'un consensus distribué complet (ex: Patroni + Raft/Etcd + IP flottante VIP) pour éviter tout SPOF sur un hôte unique.
> - 💾 **Sauvegardes & Restauration (PRA/PCA)** : Automatisation des sauvegardes déportées et chiffrées avec stratégie de rétention multi-régions.
>
> Ce projet demeure une excellente base de travail pour le **développement local, le staging, le prototypage rapide et l'expérimentation d'architectures HA**.

## 📌 À propos du Projet

Ce dépôt est un **Sandbox de Développement & Bac à sable d'Architecture d'Infrastructure** conçu pour prototyper, tester et valider des topologies de haute disponibilité à grande échelle.

Il simule un cluster de bases de données répliquées, un load balancer TCP, un pooler de connexions transactionnel et un cache in-memory avec un **Studio de Chaos Engineering** interactif pour tester les pannes en direct.

---

## 💻 Prérequis

Avant de commencer, vérifiez que votre système dispose de :
- **Docker** & **Docker Compose** (Docker Desktop 4.0+ ou Engine 20.10+)
- **Node.js** (v18 ou supérieur) & `npm`
- **GNU Make** (inclus sur macOS et Linux)

---

## 🚀 Démarrage Rapide (Quickstart)

### 1. Initialisation avec le Setup Wizard
Lancez le wizard interactif pour configurer le projet selon vos besoins :
```bash
./setup-project.sh
```
*Le wizard vous proposera de :*
- Générer des mots de passe chiffrés pour vos bases et caches.
- Choisir le profil d'infrastructure : **Minimal Sandbox** (recommandé en dev pour économiser la RAM) ou **Full Stack Monitoring** (avec Prometheus & Grafana).
- Structurer le projet applicatif (**Monorepo Turborepo** ou **Standard**).

### 2. Démarrer l'Infrastructure Core
```bash
make up
```

### 3. Lancer le Chaos Studio & Dashboard Web
```bash
make dashboard
```
Ouvrez votre navigateur sur **[http://localhost:3010](http://localhost:3010)** pour accéder à l'interface de contrôle du cluster.

---

## 🔥 Chaos Engineering & Simulation de Pannes

Le Dashboard intègre un studio interactif pour tester la résilience de l'infra :

- **💣 Interruption du Master (Melchior)** : Kills manuels ou chronométrés (1 min, 5 min, 20 min) pour simuler une panne prolongée.
- **🛡️ Watchdog de Failover Automatique** : Activez le watchdog (`make watchdog` ou bouton ON/OFF du dashboard) pour voir la réplique `balthasar` être automatiquement promue en Primary master sous 6 secondes sans coupure d'écriture.
- **🚀 Promotion & Restauration** : Promouvez manuellement des répliques ou restaurez les nœuds arrêtés en 1 clic.
- **📜 Live Audit Stream** : Flux de logs temps réel traçant l'état du cluster, les pannes et les bascules de routage HAProxy / PgBouncer.

---

## 🛠️ Matrice des Ports & Services

| Service | Port Hôte | Usage / Rôle |
| :--- | :---: | :--- |
| **HAProxy (Write)** | `:5000` | Point d'entrée Écritures (-> Primary Master) |
| **HAProxy (Read)** | `:5001` | Point d'entrée Lectures (Round-Robin -> Replicas) |
| **HAProxy Stats** | `:7000` | Web Dashboard métriques HAProxy |
| **PgBouncer** | `:6432` | Connection Pooler (Mode Transaction) |
| **Melchior DB** | `:5432` | PostgreSQL Primary Node (Master) |
| **Balthasar DB** | `:5433` | PostgreSQL Read Replica 1 |
| **Casper DB** | `:5434` | PostgreSQL Read Replica 2 |
| **Redis** | `:6379` | Cache In-Memory |
| **MinIO API / Console** | `:9000` / `:9001` | S3 API Endpoint & Interface Web |
| **Adminer** | `:8080` | Interface de gestion SQL Web |
| **Chaos Dashboard** | `:3010` | Studio de Chaos & Monitoring minimal |
| **Prometheus** *(Optionnel)* | `:9090` | Server de métriques infra |
| **Grafana** *(Optionnel)* | `:3000` | Tableaux de bord de visibilité Grafana |

---

## 📋 Commandes Utiles (Makefile)

```bash
make help        # Afficher la liste complète des commandes
make ai-start    # 🤖 AI Runner : Démarrer et valider l'infra en 1 seule commande
make verify      # Exécuter la suite complète de diagnostics de santé
make up          # Lancer l'infrastructure de base
make dashboard   # Lancer le Chaos Studio Web (http://localhost:3010)
make watchdog    # Lancer le démon de surveillance auto du failover
make status      # Vérifier l'état et la santé des conteneurs
make test        # Exécuter les tests de validation de réplication & load balance
make benchmark   # Lancer une suite de tests de charge (RPS & Latence)
make certs       # Générer les certificats SSL/TLS locaux
make backup      # Déclencher une sauvegarde logique vers le stockage S3 MinIO
make down        # Arrêter tous les conteneurs
make clean       # Tout arrêter et nettoyer les volumes de données (DESTRUCTIF)
```

---

*Projet expérimental dédié aux tests de charge, au Chaos Engineering et au prototypage d'architecture haute disponibilité.*
