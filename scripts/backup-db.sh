#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/.."

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/magi_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 [BACKUP] Début de la sauvegarde de la base de données (Melchior Master)..."

# 1. Génération du dump PostgreSQL compressé
docker exec melchior pg_dump -U root app_db | gzip > "$BACKUP_FILE"

if [ -s "$BACKUP_FILE" ]; then
  echo "✅ [BACKUP] Export local réussi : ${BACKUP_FILE}"
  
  # 2. Upload automatique vers le bucket MinIO S3 ('backups') via docker minio/mc
  echo "🚀 [MINIO S3] Envoi de la sauvegarde vers le stockage objet MinIO (Bucket: backups)..."
  
  docker run --rm --network architecture_infra_infra_network \
    minio/mc alias set myminio http://minio:9000 minio_admin minio_secret_password > /dev/null 2>&1

  docker run --rm --network architecture_infra_infra_network \
    minio/mc mb myminio/backups > /dev/null 2>&1 || true

  docker run --rm --network architecture_infra_infra_network \
    -v "$(pwd)/backups:/backups" \
    minio/mc cp "/backups/magi_backup_${TIMESTAMP}.sql.gz" "myminio/backups/magi_backup_${TIMESTAMP}.sql.gz"

  echo "🎉 [DISASTER RECOVERY] Sauvegarde archivée avec succès dans MinIO S3 !"
else
  echo "❌ [BACKUP] Échec de la génération du fichier de sauvegarde."
  exit 1
fi
