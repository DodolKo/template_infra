#!/bin/bash
set -e

ENV_FILE=".env"
CUSTOM_DOMAIN=""

# Load CUSTOM_DOMAIN from .env if present
if [ -f "$ENV_FILE" ]; then
    CUSTOM_DOMAIN=$(grep -E "^CUSTOM_DOMAIN=" "$ENV_FILE" | cut -d '=' -f2 | tr -d '"' | tr -d "'" || true)
fi

# Fast path: If domain is configured and certs exist, launch proxy immediately!
if [ -n "$CUSTOM_DOMAIN" ] && [ -f "infra/certs/server.crt" ] && [ "$1" != "--reconfig" ]; then
    echo "================================================================="
    echo "⚡ Fast-Start Proxy (Domaine configuré : $CUSTOM_DOMAIN)"
    echo "👉 Pour réinitialiser le domaine, lancez : ./scripts/start-proxy.sh --reconfig"
    echo "================================================================="
    echo "🚀 Lancement du TCP Reverse Proxy sur port 443..."
    sudo node tools/dashboard/proxy.js
    exit 0
fi

echo "================================================================="
echo "⚠️  ATTENTION: LE REVERSE PROXY EST UNE FONCTIONNALITÉ EXPÉRIMENTALE"
echo "================================================================="
echo "Le reverse proxy nécessite les droits administrateur (sudo) pour"
echo "écouter sur le port 443 (HTTPS) et masquer les numéros de port."
echo ""
read -p "Acceptez-vous d'utiliser cette feature expérimentale ? [y/N]: " accept_proxy

if [[ ! "$accept_proxy" =~ ^[Yy]$ ]]; then
    echo "🛑 Lancement du proxy annulé."
    exit 0
fi

echo ""
echo "🌍 Configuration du nom de domaine personnalisé"
read -p "Entrez votre domaine custom (ex: studio.dodolko) : " INPUT_DOMAIN

if [ -z "$INPUT_DOMAIN" ]; then
    echo "❌ Domaine invalide, annulation."
    exit 1
fi

CUSTOM_DOMAIN="$INPUT_DOMAIN"

# Save domain to .env
if grep -q "^CUSTOM_DOMAIN=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s/^CUSTOM_DOMAIN=.*/CUSTOM_DOMAIN=$CUSTOM_DOMAIN/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
else
    echo "CUSTOM_DOMAIN=$CUSTOM_DOMAIN" >> "$ENV_FILE"
fi

echo ""
echo "📄 Génération des certificats TLS pour $CUSTOM_DOMAIN..."
./scripts/generate-certs.sh "$CUSTOM_DOMAIN"

echo ""
echo "================================================================="
echo "🚨 CONFIGURATION INITIALE DU DOMAINE (À FAIRE UNE SEULE FOIS) 🚨"
echo ""
echo "1. Ajoutez l'adresse DNS :"
echo "   sudo sh -c 'echo \"127.0.0.1   $CUSTOM_DOMAIN\" >> /etc/hosts'"
echo ""
echo "2. Validez le certificat SSL local sur Mac :"
echo "   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain infra/certs/server.crt"
echo "================================================================="
echo ""
read -p "Appuyez sur ENTRÉE une fois ces commandes exécutées pour lancer le proxy..." dummy

echo ""
echo "🚀 Lancement du TCP Reverse Proxy..."
sudo node tools/dashboard/proxy.js
