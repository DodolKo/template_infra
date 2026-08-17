#!/bin/bash
set -e

echo "================================================================="
echo "🛠️ MAGI INFRASTRUCTURE - PROJECT SETUP WIZARD"
echo "================================================================="
echo "Ce script va préparer l'infrastructure pour un nouveau projet."
echo ""

# 1. Copie du .env s'il n'existe pas
if [ ! -f .env ]; then
    echo "📄 Création du fichier .env depuis .env.example..."
    cp .env.example .env
fi

# 2. Configuration des mots de passe sécurisés
read -p "Souhaitez-vous générer des mots de passe sécurisés aléatoires pour la base de données et le cache ? (y/N): " gen_pass
if [[ "$gen_pass" =~ ^[Yy]$ ]]; then
    echo "🔒 Génération des mots de passe..."
    NEW_PG_PASS=$(openssl rand -hex 16)
    NEW_PG_REP_PASS=$(openssl rand -hex 16)
    NEW_REDIS_PASS=$(openssl rand -hex 16)
    NEW_MINIO_PASS=$(openssl rand -hex 16)
    NEW_HAPROXY_PASS=$(openssl rand -hex 16)
    
    sed -i.bak "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PG_PASS/g" .env
    sed -i.bak "s/POSTGRES_REPLICATION_PASSWORD=.*/POSTGRES_REPLICATION_PASSWORD=$NEW_PG_REP_PASS/g" .env
    sed -i.bak "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$NEW_REDIS_PASS/g" .env
    sed -i.bak "s/MINIO_PASSWORD=.*/MINIO_PASSWORD=$NEW_MINIO_PASS/g" .env
    
    if ! grep -q "HAPROXY_STATS_PASSWORD" .env; then
        echo "HAPROXY_STATS_PASSWORD=$NEW_HAPROXY_PASS" >> .env
    else
        sed -i.bak "s/HAPROXY_STATS_PASSWORD=.*/HAPROXY_STATS_PASSWORD=$NEW_HAPROXY_PASS/g" .env
    fi
    rm -f .env.bak
    
    sed -i.bak "s/password=[^ ]*/password=$NEW_PG_PASS/g" infra/pgbouncer/pgbouncer.ini
    rm -f infra/pgbouncer/pgbouncer.ini.bak
    
    echo "✅ Mots de passe sécurisés générés et configurés."
else
    echo "⚠️ Utilisation des mots de passe par défaut. Idéal pour du prototypage rapide."
fi

echo ""
# 3. Profil de Monitoring & Dashboard
echo "📊 Profil de Monitoring & Consommation Mémoire :"
echo "1) Minimal Sandbox (Recommandé) : DB Cluster + Redis + MinIO + Dashboard Minimal (:3010)"
echo "2) Full Stack Monitoring : Inclut Prometheus (:9090) + Grafana (:3000) + Exporters"
read -p "Sélectionnez le mode de monitoring (1 ou 2, défaut: 1): " mon_choice

if [[ "$mon_choice" == "2" ]]; then
    echo "📈 Profil Full Monitoring activé."
    if ! grep -q "ENABLE_FULL_MONITORING" .env; then
        echo "ENABLE_FULL_MONITORING=true" >> .env
    else
        sed -i.bak "s/ENABLE_FULL_MONITORING=.*/ENABLE_FULL_MONITORING=true/g" .env && rm -f .env.bak
    fi
else
    echo "🚀 Profil Minimal Sandbox activé (léger et économe en RAM)."
    if ! grep -q "ENABLE_FULL_MONITORING" .env; then
        echo "ENABLE_FULL_MONITORING=false" >> .env
    else
        sed -i.bak "s/ENABLE_FULL_MONITORING=.*/ENABLE_FULL_MONITORING=false/g" .env && rm -f .env.bak
    fi
fi

echo ""
# 4. Choix de l'architecture du projet (Turborepo vs Standard)
echo "📦 Structure du projet applicatif :"
echo "L'industrie standardise aujourd'hui autour des Monorepos (ex: Turborepo) pour les projets Fullstack complexes (Next.js + APIs + Packages)."
read -p "Souhaitez-vous initialiser une structure Monorepo (apps/ & packages/) [Y] ou une structure standard simple [n] ? (Y/n): " repo_struct

if [[ "$repo_struct" =~ ^[Nn]$ ]]; then
    echo "🔧 Configuration de la structure standard..."
    mkdir -p src/ server/
    rm -rf apps/ api/ packages/ 2>/dev/null || true
    echo "✅ Dossiers src/ et server/ créés."
else
    echo "🚀 Maintien de la structure Monorepo (Turborepo ready)..."
    mkdir -p apps/web apps/api packages/ui packages/config
    rm -rf api/ 2>/dev/null || true
    echo "✅ Dossiers apps/ et packages/ préparés."
fi

echo ""
echo "🎉 Setup terminé ! Vous pouvez maintenant lancer l'infrastructure :"
echo "   make up"
echo "    make dashboard   (Ouvre le Chaos Studio & Dashboard sur http://localhost:3010)"
echo "   make watchdog    (Active la surveillance automatique du failover)"
echo "================================================================="
