#!/bin/bash
set -e

echo "================================================================="
echo "🧪 TESTING POSTGRESQL WAL REPLICATION (MELCHIOR -> REPLICAS)"
echo "================================================================="

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

PG_USER="${POSTGRES_USER:-postgres_admin}"
PG_DB="${POSTGRES_DB:-app_db}"

TEST_KEY="test_$(date +%s)"

echo "1. Writing sample record to Primary (melchior)..."
docker exec -i melchior psql -U "$PG_USER" -d "$PG_DB" -c "CREATE TABLE IF NOT EXISTS test_sync (id SERIAL PRIMARY KEY, val TEXT, created_at TIMESTAMP DEFAULT NOW());"
docker exec -i melchior psql -U "$PG_USER" -d "$PG_DB" -c "INSERT INTO test_sync (val) VALUES ('$TEST_KEY');"

echo "2. Waiting 1 second for WAL replication..."
sleep 1

echo "3. Verifying record presence on Replica 1 (balthasar)..."
BALTHASAR_COUNT=$(docker exec -i balthasar psql -U "$PG_USER" -d "$PG_DB" -t -A -c "SELECT COUNT(*) FROM test_sync WHERE val='$TEST_KEY';" 2>/dev/null || echo "0")

echo "4. Verifying record presence on Replica 2 (casper)..."
CASPER_COUNT=$(docker exec -i casper psql -U "$PG_USER" -d "$PG_DB" -t -A -c "SELECT COUNT(*) FROM test_sync WHERE val='$TEST_KEY';" 2>/dev/null || echo "0")

BALTHASAR_COUNT=$(echo "$BALTHASAR_COUNT" | tr -dc '0-9')
CASPER_COUNT=$(echo "$CASPER_COUNT" | tr -dc '0-9')
BALTHASAR_COUNT=${BALTHASAR_COUNT:-0}
CASPER_COUNT=${CASPER_COUNT:-0}

if [ "$BALTHASAR_COUNT" -ge 1 ] && [ "$CASPER_COUNT" -ge 1 ]; then
    echo "✅ SUCCESS: WAL replication verified on both Balthasar and Casper!"
else
    echo "❌ FAILURE: Replication out of sync. Balthasar: $BALTHASAR_COUNT, Casper: $CASPER_COUNT"
    exit 1
fi
