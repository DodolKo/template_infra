# Routage & Load Balancing avec HAProxy

Stratégie de répartition de charge et routage TCP via HAProxy 2.8.

---

## 1. Principes de Routage

Reverse Proxy TCP Layer 4 séparant les flux d'écriture et de lecture.

```
                              +--------------------+
                              | Requetes App / Client|
                              +---------+----------+
                                        |
                  +---------------------+---------------------+
                  |                                           |
        Port 5000 (Write Frontend)                  Port 5001 (Read Frontend)
                  |                                           |
                  v                                           v
       +-----------------------+                   +-----------------------+
       | Write Backend (Primary)|                   | Read Backend (Cluster)|
       +-----------+-----------+                   +-----------+-----------+
                   |                                           |
                   v                                    +------+------+
            [ melchior_db ]                             |             |
                                                        v             v
                                                 [ balthasar_db ] [ casper_db ]
```

---

## 2. Ports Exposés & Configuration HAProxy

Fichier de config : `./haproxy/haproxy.cfg`.

### Frontend Écritures (Primary DB)
- Port : `5000` -> `melchior_db:5432`
- Healthcheck : `pg_isready` (toutes les 2s).

### Frontend Lectures (Read Replicas)
- Port : `5001` -> Round-Robin entre `balthasar_db:5432` et `casper_db:5432`.

### Dashboard Métriques
- Port : `7000` (`http://localhost:7000/stats`)
- Auth par défaut : `admin` / `adminpass`.

---

## 3. Directives pour Agents IA

- Tout nouveau port backend exige la mise à jour de `haproxy.cfg`.
- En cas de panne de `melchior_db`, le backend d'écriture rejette les connexions jusqu'à la promotion d'un nouveau Primary.
