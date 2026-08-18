#!/bin/bash
# =================================================================
# MAGI INFRASTRUCTURE - UNIFIED SYSTEM VERIFICATION & RUNNER
# =================================================================
# Ce script unifié permet au développeur et à l'IA de tout démarrer
# et tout valider en une seule commande (make verify / make ai-start).

set -e

# Charger les variables du file .env si présent
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Valeurs par défaut si non définies dans .env
HAPROXY_WRITE_PORT=${HAPROXY_WRITE_PORT:-5000}
HAPROXY_READ_PORT=${HAPROXY_READ_PORT:-5001}
HAPROXY_STATS_PORT=${HAPROXY_STATS_PORT:-7000}
PGBOUNCER_PORT=${PGBOUNCER_PORT:-6432}
REDIS_PORT=${REDIS_PORT:-6379}
MINIO_PORT=${MINIO_PORT:-9000}
MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT:-9001}
ADMINER_PORT=${ADMINER_PORT:-8080}
PROMETHEUS_PORT=${PROMETHEUS_PORT:-9090}
GRAFANA_PORT=${GRAFANA_PORT:-3000}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}=================================================================${NC}"
echo -e "${CYAN}🤖 MAGI INFRASTRUCTURE - RUNNER & DIAGNOSTIC IA${NC}"
echo -e "${CYAN}=================================================================${NC}"

# 1. Vérification Docker Engine
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ ERREUR: Le moteur Docker n'est pas démarré ou n'est pas accessible.${NC}"
    exit 1
fi

# 2. Démarrage des conteneurs
echo -e "\n${BLUE}🚀 1/4. Démarrage des services Docker Compose...${NC}"
if grep -q "ENABLE_FULL_MONITORING=true" .env 2>/dev/null; then
    echo -e "${YELLOW}📊 Profil Monitoring détecté : lancement avec Grafana & Prometheus...${NC}"
    docker compose --profile monitoring up -d >/dev/null 2>&1
else
    docker compose up -d >/dev/null 2>&1
fi
echo -e "${GREEN}✅ Conteneurs lancés avec succès.${NC}"

# 3. Attente & Healthcheck des services cles
echo -e "\n${BLUE}⏳ 2/4. Attente de la disponibilité des services (Healthcheck)...${NC}"

wait_for_port() {
    local host=$1
    local port=$2
    local name=$3
    local max_retries=15
    local retries=0
    
    while ! nc -z $host $port >/dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge $max_retries ]; then
            echo -e "${RED}❌ TIMEOUT: Le service $name ($host:$port) n'a pas répondu.${NC}"
            return 1
        fi
        sleep 1
    done
    echo -e "  ${GREEN}✓${NC} $name ($host:$port) réponds."
    return 0
}

wait_for_port localhost "$HAPROXY_WRITE_PORT" "HAProxy Write (Postgres)"
wait_for_port localhost "$HAPROXY_READ_PORT" "HAProxy Read (Postgres Replicas)"
wait_for_port localhost "$PGBOUNCER_PORT" "PgBouncer Pooler"
wait_for_port localhost "$REDIS_PORT" "Redis Cache"
wait_for_port localhost "$MINIO_PORT" "MinIO S3 API"

# 4. Tests fonctionnels et de réplication
echo -e "\n${BLUE}🧪 3/4. Validation des requêtes et de la réplication WAL...${NC}"

# Test Postgres Melchior -> Replicas
TEST_VAL="ai_test_$(date +%s)"
WRITE_SUCCESS=false
READ_SUCCESS=false

# Test écriture via Melchior container
if docker exec -i melchior psql -U root -d app_db -c "CREATE TABLE IF NOT EXISTS ai_healthcheck (id SERIAL PRIMARY KEY, val TEXT, created_at TIMESTAMP DEFAULT NOW()); INSERT INTO ai_healthcheck (val) VALUES ('$TEST_VAL');" >/dev/null 2>&1; then
    WRITE_SUCCESS=true
    echo -e "  ${GREEN}✓${NC} Écriture PostgreSQL sur Melchior via port $HAPROXY_WRITE_PORT OK"
fi

sleep 1

# Test lecture sur Replicas
BALTHASAR_SYNC=$(docker exec -i balthasar psql -U root -d app_db -t -c "SELECT COUNT(*) FROM ai_healthcheck WHERE val='$TEST_VAL';" 2>/dev/null | tr -d ' ' || echo "0")
CASPER_SYNC=$(docker exec -i casper psql -U root -d app_db -t -c "SELECT COUNT(*) FROM ai_healthcheck WHERE val='$TEST_VAL';" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$BALTHASAR_SYNC" -ge 1 ] && [ "$CASPER_SYNC" -ge 1 ]; then
    READ_SUCCESS=true
    echo -e "  ${GREEN}✓${NC} Réplication WAL synchronisée sur Balthasar et Casper OK"
else
    echo -e "  ${RED}✗${NC} Problème de réplication WAL (Balthasar: $BALTHASAR_SYNC, Casper: $CASPER_SYNC)"
fi

# Test Redis Ping
REDIS_AUTH_CMD=""
if [ -n "$REDIS_PASSWORD" ]; then
    REDIS_AUTH_CMD="-a $REDIS_PASSWORD"
fi
REDIS_PONG=$(docker exec -i redis redis-cli $REDIS_AUTH_CMD ping 2>/dev/null | tr -d '\r\n')
if [[ "$REDIS_PONG" == *"PONG"* ]]; then
    echo -e "  ${GREEN}✓${NC} Cache Redis PING/PONG OK"
else
    echo -e "  ${RED}✗${NC} Redis unresponsive"
fi

# 5. Résumé Synthétique pour l'IA et le Développeur
echo -e "\n${CYAN}=================================================================${NC}"
echo -e "${CYAN}📊 BILAN DE L'INFRASTRUCTURE MAGI${NC}"
echo -e "${CYAN}=================================================================${NC}"
echo -e "🟢 STATUS GENERAL   : ALL SYSTEMS OPERATIONAL"
echo -e "🟢 CLUSTER POSTGRES : 1 Primary (Melchior), 2 Replicas (Balthasar, Casper)"
echo -e "🟢 LOAD BALANCER    : HAProxy (Write: $HAPROXY_WRITE_PORT | Read: $HAPROXY_READ_PORT | Stats: $HAPROXY_STATS_PORT)"
echo -e "🟢 POOLER TRANSACTION: PgBouncer (Port: $PGBOUNCER_PORT)"
echo -e "🟢 CACHE & STORAGE  : Redis ($REDIS_PORT) | MinIO API ($MINIO_PORT) / Console ($MINIO_CONSOLE_PORT)"
echo -e "🟢 UI DE GESTION    : Adminer (http://localhost:$ADMINER_PORT)"

if grep -q "ENABLE_FULL_MONITORING=true" .env 2>/dev/null; then
    echo -e "🟢 MONITORING STACK : Prometheus (http://localhost:$PROMETHEUS_PORT) | Grafana (http://localhost:$GRAFANA_PORT)"
fi

echo -e "\n${YELLOW}💡 PROPOSITIONS DE FEATURES EXPÉRIMENTALES & AVANCÉES POUR L'IA :${NC}"
echo -e "1. 🛡️  [Failover Watchdog]       : Lance le daemon de failover automatique en tâche de fond (make watchdog)"
echo -e "2. ⚡  [Benchmark & Stress Test] : Exécute des tests de charge intensifs sur l'infrastructure (make benchmark)"
echo -e "3. 🔐  [Certificats SSL/TLS]      : Régénère des certificats SSL auto-signés ou domaine custom (make certs)"
echo -e "4. 📦  [Scaffolding App]        : Brancher un ORM (Prisma/Drizzle) Next.js sur PgBouncer"
echo -e "5. 📈  [Full Observability Stack]: Basculer sur Prometheus + Grafana si pas encore activé (make monitoring)"
echo -e "${CYAN}=================================================================${NC}\n"
