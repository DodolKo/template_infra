#!/bin/bash

# Se placer dans le répertoire racine du projet
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR/../.."

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PG_USER="${POSTGRES_USER:-root}"
PG_DB="${POSTGRES_DB:-app_db}"

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "⚠️ Usage: ./scripts/db/restore.sh <nom_du_fichier_backup.sql.gz>"
  echo "Backups disponibles :"
  ls -l ./backups/ 2>/dev/null || echo "Aucun backup local trouvé."
  exit 1
fi

FULL_PATH="./backups/${BACKUP_FILE}"

if [ ! -f "$FULL_PATH" ]; then
  echo "❌ Fichier de sauvegarde introuvable : ${FULL_PATH}"
  exit 1
fi

echo "♻️ [DISASTER RECOVERY] Restauration de la base de données depuis ${BACKUP_FILE}..."

gunzip -c "$FULL_PATH" | docker exec -i melchior psql -U "$PG_USER" -d "$PG_DB"

echo "✅ [DISASTER RECOVERY] Base de données restaurée avec succès !"
