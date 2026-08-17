# 🚀 Scalable Infrastructure Architecture Testbed

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![HAProxy](https://img.shields.io/badge/HAProxy-000000?style=for-the-badge&logo=haproxy&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![NodeJS](https://img.shields.io/badge/NodeJS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/Status-Active_POC-brightgreen?style=for-the-badge)

## 📌 À propos du Projet

Ce dépôt est un **mini-projet Proof of Concept (PoC)** conçu pour tester, valider et faire monter en charge une **infrastructure hautement disponible et scalable à grande échelle**.

Il simule un environnement de production résilient gérant la haute disponibilité des données, la répartition de charge et le pooling de connexions.

---

## 🛠️ Composants Clés de l'Infrastructure

- **HAProxy** : Equalizer & Load Balancer pour les requêtes entrantes et le routage des bases de données.
- **PgBouncer** : Connection Pooler PostgreSQL haute performance pour gérer des milliers de connexions simultanées.
- **PostgreSQL Cluster (Primary / Standby)** : Replication Master-Replica et basculement automatique.
- **Redis Cache & Session Store** : In-memory storage pour alléger la charge de la base de données.
- **Dashboard & Scripts d'Orchestration** : Outils de monitoring en temps réel et scripts d'automatisation.

---

## 🚀 Démarrage Rapide

```bash
# Lancer l'infrastructure complète
./scripts/start.sh
```

---

*Projet expérimental dédié aux tests de charge et d'architecture système.*
