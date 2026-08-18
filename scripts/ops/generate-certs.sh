#!/bin/bash
set -e

# =================================================================
# 🔒 INFRASTRUCTURE - SELF-SIGNED TLS CERTIFICATE GENERATOR
# =================================================================

CERTS_DIR="infra/certs"
mkdir -p "$CERTS_DIR"

SERVER_KEY="$CERTS_DIR/server.key"
SERVER_CRT="$CERTS_DIR/server.crt"
HAPROXY_PEM="$CERTS_DIR/haproxy.pem"

CUSTOM_DOMAIN=${1:-""}

if [ -f "$SERVER_KEY" ] && [ -f "$SERVER_CRT" ] && [ -z "$CUSTOM_DOMAIN" ]; then
    echo "✅ Certificats TLS déjà présent dans '$CERTS_DIR'."
    exit 0
fi

echo "🔐 Génération des certificats SSL/TLS auto-signés pour dev local (localhost)..."

CUSTOM_DOMAIN=${1:-""}

SAN_EXT="subjectAltName=DNS:localhost,DNS:*.local,DNS:*.infra.com,DNS:*.dodolko,IP:127.0.0.1"
CN_NAME="localhost"

if [ -n "$CUSTOM_DOMAIN" ]; then
    SAN_EXT="$SAN_EXT,DNS:$CUSTOM_DOMAIN,DNS:*.$CUSTOM_DOMAIN"
    CN_NAME="$CUSTOM_DOMAIN"
    echo "🌐 Injection du domaine custom et wildcard dans le certificat : $CUSTOM_DOMAIN (*.$CUSTOM_DOMAIN)"
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SERVER_KEY" \
  -out "$SERVER_CRT" \
  -days 365 \
  -subj "/CN=$CN_NAME/O=Infra Local/C=FR" \
  -addext "$SAN_EXT" \
  2>/dev/null || \
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SERVER_KEY" \
  -out "$SERVER_CRT" \
  -days 365 \
  -subj "/CN=$CN_NAME/O=Infra Local/C=FR" 2>/dev/null

# Combined PEM file for HAProxy TLS offloading
cat "$SERVER_CRT" "$SERVER_KEY" > "$HAPROXY_PEM"

echo "✅ Certificats SSL/TLS générés dans '$CERTS_DIR' :"
echo "   - Key  : $SERVER_KEY"
echo "   - Cert : $SERVER_CRT"
echo "   - PEM  : $HAPROXY_PEM"
echo "================================================================="
