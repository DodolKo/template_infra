#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/../.."

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PG_USER="${POSTGRES_USER:-root}"
PG_DB="${POSTGRES_DB:-app_db}"
M_USER="${MINIO_USER:-minio_admin}"
M_PASS="${MINIO_PASSWORD:-minio_secret_password}"

# Détection dynamique du réseau Docker de Melchior
DOCKER_NET=$(docker inspect melchior --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)
if [ -z "$DOCKER_NET" ]; then
  DOCKER_NET="infra_network"
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 [BACKUP] Début de la sauvegarde de la base de données (Melchior Master)..."

# 1. Génération du dump PostgreSQL compressé
docker exec melchior pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$BACKUP_FILE"

if [ -s "$BACKUP_FILE" ]; then
  echo "✅ [BACKUP] Export local réussi : ${BACKUP_FILE}"
  
  # 2. Upload automatique vers le bucket MinIO S3 ('backups') via docker minio/mc
  echo "🚀 [MINIO S3] Envoi de la sauvegarde vers le stockage objet MinIO (Bucket: backups)..."
  
  docker run --rm --network "$DOCKER_NET" \
    minio/mc alias set myminio http://minio:9000 "$M_USER" "$M_PASS" > /dev/null 2>&1

  docker run --rm --network "$DOCKER_NET" \
    minio/mc mb myminio/backups > /dev/null 2>&1 || true

  docker run --rm --network "$DOCKER_NET" \
    -v "$(pwd)/backups:/backups" \
    minio/mc cp "/backups/db_backup_${TIMESTAMP}.sql.gz" "myminio/backups/db_backup_${TIMESTAMP}.sql.gz"

  echo "🎉 [DISASTER RECOVERY] Sauvegarde archivée avec succès dans MinIO S3 !"
else
  echo "❌ [BACKUP] Échec de la génération du fichier de sauvegarde."
  exit 1
fi
