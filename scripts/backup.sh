#!/bin/sh
# Sicherung der PostgreSQL-Datenbank auf dem Server.
#
#   ./scripts/backup.sh            Sicherung anlegen
#   ./scripts/backup.sh restore DATEI   Sicherung zurückspielen (überschreibt die Datenbank!)
#
# Legt eine komprimierte Sicherung (pg_dump, Custom-Format) in ./backups ab und
# löscht Sicherungen älter als BACKUP_KEEP_DAYS (Standard: 14 Tage).
# Täglich per cron ausführen, siehe docs/BETRIEB.md.
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

if [ "${1:-}" = "restore" ]; then
  FILE="${2:?Bitte die Sicherungsdatei angeben: ./scripts/backup.sh restore backups/finanzklee-….dump}"
  [ -f "$FILE" ] || { echo "Datei nicht gefunden: $FILE" >&2; exit 1; }
  echo "Spiele $FILE zurück. Die App wird dafür kurz angehalten."
  docker compose stop app
  docker compose exec -T db pg_restore -U finanzklee -d finanzklee --clean --if-exists --no-owner < "$FILE"
  docker compose start app
  echo "Fertig."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/finanzklee-$(date +%Y-%m-%d-%H%M%S).dump"

# Erst in eine temporäre Datei schreiben: Bricht pg_dump ab, bleibt keine halbe Sicherung liegen
docker compose exec -T db pg_dump -U finanzklee -d finanzklee -Fc > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
echo "Gesichert: $FILE ($(du -h "$FILE" | cut -f1))"

find "$BACKUP_DIR" -name 'finanzklee-*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/Gelöscht (älter als '"$KEEP_DAYS"' Tage): /'
