#!/bin/bash
set -e

echo "================================================================="
echo "💥 EMERGENCY DISASTER RECOVERY: FAILOVER PROMOTION"
echo "================================================================="

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

TARGET_REPLICA="${1:-balthasar}"
FORCE_FAILOVER="${2:-false}"

echo "🔍 Checking status of Primary node (melchior)..."

if [ "$FORCE_FAILOVER" != "true" ] && docker exec melchior pg_isready -U ${POSTGRES_USER:-postgres_admin} >/dev/null 2>&1; then
    echo "⚠️ WARNING: Melchior Primary node is still responding!"
    echo "If you really want to force failover, stop melchior first (docker stop melchior)."
    read -p "Do you want to force promotion of $TARGET_REPLICA anyway? (y/N) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Failover aborted."
        exit 1
    fi
fi

echo "🚀 Promoting replica '$TARGET_REPLICA' to PRIMARY DB..."
docker exec -i "$TARGET_REPLICA" touch /tmp/promote_signal || docker exec -i "$TARGET_REPLICA" pg_ctl promote

echo "✅ Node '$TARGET_REPLICA' promoted!"

# 🔄 Update PgBouncer configuration dynamically
PGBOUNCER_INI="infra/pgbouncer/pgbouncer.ini"
if [ -f "$PGBOUNCER_INI" ]; then
    echo "🔄 Updating PgBouncer target to '${TARGET_REPLICA}_db'..."
    TARGET_HOST="${TARGET_REPLICA}_db"
    sed -i.bak "s/host=[^ ]*/host=$TARGET_HOST/g" "$PGBOUNCER_INI"
    rm -f "$PGBOUNCER_INI.bak"
    
    # Reload PgBouncer if container is running
    if docker ps --format '{{.Names}}' | grep -q "^pgbouncer$"; then
        echo "⚡ Reloading PgBouncer configuration at runtime..."
        docker exec pgbouncer pgbouncer -R /etc/pgbouncer/pgbouncer.ini 2>/dev/null || docker restart pgbouncer >/dev/null 2>&1 || true
    fi
fi

echo "ℹ️ New Primary is now: $TARGET_REPLICA"
echo "================================================================="
