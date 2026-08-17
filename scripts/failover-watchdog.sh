#!/bin/bash
# =================================================================
# 🛡️ MAGI INFRASTRUCTURE - FAILOVER WATCHDOG DAEMON
# Surveillance en temps réel du Master PostgreSQL et Bascule Auto
# =================================================================

CHECK_INTERVAL=3
MAX_FAILURES=2
CURRENT_PRIMARY="melchior"
FAIL_COUNT=0

echo "🛡️ Starting Failover Watchdog Daemon..."
echo "📡 Monitoring primary node: $CURRENT_PRIMARY (Check interval: ${CHECK_INTERVAL}s)"

while true; do
    # Check if primary container is running and healthy
    IS_RUNNING=$(docker inspect -f '{{.State.Running}}' "$CURRENT_PRIMARY" 2>/dev/null || echo "false")
    
    if [ "$IS_RUNNING" = "true" ]; then
        if docker exec "$CURRENT_PRIMARY" pg_isready -U ${POSTGRES_USER:-root} >/dev/null 2>&1; then
            FAIL_COUNT=0
        else
            FAIL_COUNT=$((FAIL_COUNT + 1))
            echo "⚠️ Primary '$CURRENT_PRIMARY' PostgreSQL service not ready (Fail $FAIL_COUNT/$MAX_FAILURES)"
        fi
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "🚨 Primary '$CURRENT_PRIMARY' container is DOWN (Fail $FAIL_COUNT/$MAX_FAILURES)"
    fi

    if [ "$FAIL_COUNT" -ge "$MAX_FAILURES" ]; then
        echo "💥 PRIMARY NODE FAILURE DETECTED!"
        echo "⚡ Triggering automatic promotion sequence..."
        
        # Determine candidate replica
        CANDIDATE="balthasar"
        if ! docker ps --format '{{.Names}}' | grep -q "^balthasar$"; then
            CANDIDATE="casper"
        fi
        
        echo "🚀 Automatic failover target selected: $CANDIDATE"
        ./scripts/failover-promote.sh "$CANDIDATE" "true"
        
        CURRENT_PRIMARY="$CANDIDATE"
        FAIL_COUNT=0
        echo "✅ Failover completed. New monitored Primary is: $CURRENT_PRIMARY"
    fi

    sleep "$CHECK_INTERVAL"
done
