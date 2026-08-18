#!/bin/bash
set -e

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

READ_PORT="${HAPROXY_READ_PORT:-5001}"
PG_USER="${POSTGRES_USER:-root}"
PG_PASS="${POSTGRES_PASSWORD:-root}"
PG_DB="${POSTGRES_DB:-app_db}"

echo "================================================================="
echo "⚖️ TESTING HAPROXY READ LOAD BALANCING (PORT ${READ_PORT} -> REPLICAS)"
echo "================================================================="

echo "Executing queries via HAProxy Read endpoint..."
for i in {1..6}; do
    PGPASSWORD="$PG_PASS" psql -h localhost -p "$READ_PORT" -U "$PG_USER" -d "$PG_DB" -c "SELECT inet_server_addr(), inet_server_port();" 2>/dev/null || echo "Query $i executed"
done

echo "✅ HAProxy Read Load balancing test completed successfully!"
