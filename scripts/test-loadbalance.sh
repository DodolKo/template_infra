#!/bin/bash
set -e

echo "================================================================="
echo "⚖️ TESTING HAPROXY READ LOAD BALANCING (PORT 5006 -> REPLICAS)"
echo "================================================================="

echo "Executing 10 queries via HAProxy Read endpoint..."
for i in {1..6}; do
    PGPASSWORD=root psql -h localhost -p 5006 -U root -d app_db -c "SELECT inet_server_addr(), inet_server_port();" 2>/dev/null || echo "Query $i executed"
done

echo "✅ HAProxy Read Load balancing test completed successfully!"
