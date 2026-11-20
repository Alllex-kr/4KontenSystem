#!/bin/sh
# Startet FinanzKlee im Container:
# 1. spielt neue Datenbank-Migrationen ein (bereits eingespielte werden übersprungen)
# 2. startet den Next.js-Server
set -e

echo "[FinanzKlee] Datenbank-Migrationen einspielen …"
prisma migrate deploy --schema ./prisma/schema.prisma

echo "[FinanzKlee] Server startet auf Port ${PORT:-3000}"
exec node server.js
