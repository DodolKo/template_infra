#!/bin/bash
set -e

echo "================================================================="
echo "📊 MONITORING STACK INSTALLER / CONFIGURATOR"
echo "================================================================="
echo "Select monitoring option:"
echo "1) Enable Prometheus + Grafana Stack (Recommended)"
echo "2) Run minimal core infrastructure without heavy monitoring"
echo "3) Exit"
echo "-----------------------------------------------------------------"

read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo "🚀 Starting Infrastructure WITH Prometheus & Grafana monitoring..."
        docker compose --profile monitoring up -d
        echo "✅ Monitoring Stack running!"
        echo "   - Prometheus: http://localhost:9090"
        echo "   - Grafana:    http://localhost:3000 (User: admin / Pass: admin)"
        ;;
    2)
        echo "🚀 Starting Core Infrastructure only..."
        docker compose up -d
        echo "✅ Core Infrastructure running!"
        ;;
    3)
        echo "Exiting."
        exit 0
        ;;
    *)
        echo "Invalid option."
        exit 1
        ;;
esac
