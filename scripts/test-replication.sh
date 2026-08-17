#!/bin/bash
set -e

echo "================================================================="
echo "🧪 TESTING POSTGRESQL WAL REPLICATION (MELCHIOR -> REPLICAS)"
echo "================================================================="

TEST_KEY="test_$(date +%s)"

echo "1. Writing sample record to Primary (melchior)..."
docker exec -i melchior psql -U root -d app_db -c "CREATE TABLE IF NOT EXISTS test_sync (id SERIAL PRIMARY KEY, val TEXT, created_at TIMESTAMP DEFAULT NOW());" > /dev/null
docker exec -i melchior psql -U root -d app_db -c "INSERT INTO test_sync (val) VALUES ('$TEST_KEY');" > /dev/null

echo "2. Waiting 1 second for WAL replication..."
sleep 1

echo "3. Verifying record presence on Replica 1 (balthasar)..."
BALTHASAR_COUNT=$(docker exec -i balthasar psql -U root -d app_db -t -c "SELECT COUNT(*) FROM test_sync WHERE val='$TEST_KEY';" | tr -d ' ')

echo "4. Verifying record presence on Replica 2 (casper)..."
CASPER_COUNT=$(docker exec -i casper psql -U root -d app_db -t -c "SELECT COUNT(*) FROM test_sync WHERE val='$TEST_KEY';" | tr -d ' ')

if [ "$BALTHASAR_COUNT" -ge 1 ] && [ "$CASPER_COUNT" -ge 1 ]; then
    echo "✅ SUCCESS: WAL replication verified on both Balthasar and Casper!"
else
    echo "❌ FAILURE: Replication out of sync. Balthasar: $BALTHASAR_COUNT, Casper: $CASPER_COUNT"
    exit 1
fi
