# Cluster PostgreSQL MAGI & PgBouncer

Description du cluster de base de données PostgreSQL haute disponibilité MAGI (`melchior`, `balthasar`, `casper`) et de PgBouncer.

---

## 1. Topologie des Nœuds

PostgreSQL 16 (Alpine) avec un nœud primaire et deux répliques en lecture seule :

```
                        +--------------------+
                        | HAProxy / App Client|
                        +---------+----------+
                                  |
            +---------------------+---------------------+
            | Écritures (Port 5000)                     | Lectures (Port 5001)
            v                                           v
    +---------------+                           +---------------+
    |   PgBouncer   |                           | HAProxy Read  |
    |  (Port 6432)  |                           |  Round-Robin  |
    +-------+-------+                           +-------+-------+
            |                                           |
            v                                  +--------+--------+
    +---------------+                          |                 |
    |  melchior_db  |==== Streaming WAL ======>|  balthasar_db   |  casper_db  |
    |   (Primary)   |                          |   (Replica 1)   | (Replica 2) |
    +---------------+                          +-----------------+-------------+
```

### Détails des Nœuds

1. **Melchior (`melchior_db`) - Primary Node (Master)**
   - Port externe : `5432`
   - Rôle : Écritures (`INSERT`, `UPDATE`, `DELETE`, DDL).
   - Configuration WAL : `wal_level = replica`, `max_wal_senders = 10`, `max_replication_slots = 10`, `hot_standby = on`.
   - Script init : `./scripts/init-primary.sh`.

2. **Balthasar (`balthasar_db`) - Read Replica 1**
   - Port externe : `5433`
   - Rôle : Réplique Read-Only (`pg_basebackup`).

3. **Casper (`casper_db`) - Read Replica 2**
   - Port externe : `5434`
   - Rôle : Réplique Read-Only pour charge de lecture lourde.

---

## 2. Pooler de Connexions PgBouncer

Positionné en amont du nœud Primary (`melchior_db`).

- Port externe : `6432`
- Mode de pooling : `Transaction`
- Max connexions clients : `2000` (`MAX_CLIENT_CONN`)
- Taille par défaut du pool : `30` (`DEFAULT_POOL_SIZE`)
- Config : `./pgbouncer/pgbouncer.ini`, `./pgbouncer/userlist.txt`.

---

## 3. Directives pour Développeurs et Agents IA

- Écritures / Migrations : HAProxy (`localhost:5000`), PgBouncer (`localhost:6432`) ou Melchior (`localhost:5432`).
- Lectures : HAProxy (`localhost:5001`).
- Ne jamais exécuter de migrations DDL sur `balthasar` ou `casper`.
