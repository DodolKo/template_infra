#!/bin/bash
set -e

# =================================================================
# 🔒 MAGI INFRASTRUCTURE - SELF-SIGNED TLS CERTIFICATE GENERATOR
# =================================================================

CERTS_DIR="infra/certs"
mkdir -p "$CERTS_DIR"

SERVER_KEY="$CERTS_DIR/server.key"
SERVER_CRT="$CERTS_DIR/server.crt"
HAPROXY_PEM="$CERTS_DIR/haproxy.pem"

if [ -f "$SERVER_KEY" ] && [ -f "$SERVER_CRT" ]; then
    echo "✅ Certificats TLS déjà présent dans '$CERTS_DIR'."
    exit 0
fi

echo "🔐 Génération des certificats SSL/TLS auto-signés pour dev local (localhost)..."

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SERVER_KEY" \
  -out "$SERVER_CRT" \
  -days 365 \
  -subj "/CN=localhost/O=MAGI Infra Local/C=FR" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  2>/dev/null || \
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SERVER_KEY" \
  -out "$SERVER_CRT" \
  -days 365 \
  -subj "/CN=localhost/O=MAGI Infra Local/C=FR" 2>/dev/null

# Combined PEM file for HAProxy TLS offloading
cat "$SERVER_CRT" "$SERVER_KEY" > "$HAPROXY_PEM"

echo "✅ Certificats SSL/TLS générés dans '$CERTS_DIR' :"
echo "   - Key  : $SERVER_KEY"
echo "   - Cert : $SERVER_CRT"
echo "   - PEM  : $HAPROXY_PEM"
echo "================================================================="
