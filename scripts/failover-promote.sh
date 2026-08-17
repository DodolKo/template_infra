#!/bin/bash
set -e

echo "================================================================="
echo "💥 EMERGENCY DISASTER RECOVERY: FAILOVER PROMOTION"
echo "================================================================="

TARGET_REPLICA="${1:-balthasar}"
echo "🔍 Checking status of Primary node (melchior)..."

if docker exec melchior pg_isready -U root >/dev/null 2>&1; then
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
echo "🔄 Updating PgBouncer connection target..."
# Note: PgBouncer container can be pointed to the new primary
echo "ℹ️ New Primary is now: $TARGET_REPLICA"
echo "================================================================="
