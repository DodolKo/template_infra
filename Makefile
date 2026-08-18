# =================================================================
# INFRASTRUCTURE ARCHITECTURE - UNIFIED COMMAND CLI
# =================================================================

.PHONY: help up down restart status test benchmark failover watchdog dashboard certs backup clean

help:
	@echo "================================================================="
	@echo "🛠️ INFRASTRUCTURE ARCHITECTURE - COMMAND CLI"
	@echo "================================================================="
	@echo "  make up          - Start core infrastructure (Postgres HA, PgBouncer, HAProxy, Redis, MinIO)"
	@echo "  make monitoring  - Start infrastructure WITH Prometheus & Grafana Monitoring"
	@echo "  make down        - Stop all running containers"
	@echo "  make restart     - Restart all infrastructure services"
	@echo "  make status      - Display container health and running ports"
	@echo "  make test        - Run replication & load balancing validation tests"
	@echo "  make benchmark   - Run load test benchmark engine"
	@echo "  make dashboard   - Launch Infra Control Center (Dual HTTP/HTTPS on port 3010)"
	@echo "  make watchdog    - Start automatic failover monitoring daemon"
	@echo "  make certs       - Generate local self-signed SSL/TLS certificates"
	@echo "  make failover    - Trigger emergency failover promotion script"
	@echo "  make backup      - Create a logical backup of PostgreSQL primary"
	@echo "  make clean       - Stop containers and remove volumes (DESTRUCTIVE)"
	@echo "================================================================="

up:
	@echo "🚀 Starting core infrastructure..."
	docker compose up -d

monitoring:
	@echo "🚀 Starting infrastructure with Prometheus & Grafana..."
	docker compose --profile monitoring up -d

down:
	@echo "🛑 Stopping infrastructure..."
	docker compose --profile monitoring down

restart:
	@echo "🔄 Restarting infrastructure..."
	@./scripts/ops/restart.sh

status:
	@echo "📊 Container Status:"
	@docker compose ps

test:
	@echo "🧪 Running validation tests..."
	@./scripts/db/test-replication.sh
	@./scripts/benchmark/test-loadbalance.sh

benchmark:
	@echo "⚡ Running load benchmark suite..."
	@npm run benchmark

dashboard:
	@echo "💻 Launching interactive Chaos Studio & Management Dashboard..."
	@npm start

watchdog:
	@echo "🛡️ Starting Automatic Failover Watchdog..."
	@./scripts/db/failover-watchdog.sh

certs:
	@echo "🔐 Generating local TLS certificates..."
	@./scripts/ops/generate-certs.sh

failover:
	@echo "💥 Triggering failover promotion script..."
	@./scripts/db/failover-promote.sh balthasar

backup:
	@echo "💾 Executing PostgreSQL backup..."
	@./scripts/db/backup.sh

clean:
	@echo "⚠️ Cleaning all containers, networks, and persistent data volumes..."
	docker compose --profile monitoring down -v

