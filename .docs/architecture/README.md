# Architecture & Infrastructure Documentation

Documentation technique de l'architecture d'infrastructure.

---

## Sommaire des Guides Technologiques

| Document | Description |
| :--- | :--- |
| **[01. Cluster de Base de Données MAGI](file://./01-database-cluster.md)** | PostgreSQL Primary/Standby (`melchior`, `balthasar`, `casper`), réplication WAL & PgBouncer pooler. |
| **[02. Routage & Load Balancing HAProxy](file://./02-network-loadbalancing.md)** | Partitionnement Écritures (Port 5000) et Lectures (Port 5001), healthchecks et métriques sur le port 7000. |
| **[03. Couche Cache & Object Storage](file://./03-cache-storage-layer.md)** | Redis (in-memory LRU) & MinIO S3 Object Storage pour fichiers volumineux et médias. |
| **[04. Opérations, Maintenance & Disaster Recovery](file://./04-operations-maintenance.md)** | Scripts shell, Makefile, Prometheus/Grafana, et procédures de failover. |
| **[05. Intégration d'Applications & Sécurité DB](file://./05-application-integration.md)** | Intégration d'AdonisJS, Rust, NextJS, MinIO S3 et sécurisation des migrations DB. |

---

## Guide d'Orientation Rapide

- Pour les agents IA et développeurs, consultez d'abord **[AGENT.md](file://../../AGENT.md)** à la racine.
- Pour l'intégration d'une API AdonisJS/Rust, voir **[05-application-integration.md](file://./05-application-integration.md)**.
- Pour l'équilibrage de charge réseau, voir **[02-network-loadbalancing.md](file://./02-network-loadbalancing.md)**.
- Pour les migrations et schéma SQL, voir **[01-database-cluster.md](file://./01-database-cluster.md)**.

