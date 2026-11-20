# FinanzKlee auf dem Server betreiben (Docker)

Auf dem Server laufen drei Container, gestartet über `compose.yml`:

```
Internet → Caddy (HTTPS, Port 80/443) → App (Next.js) → PostgreSQL
```

Nur Caddy ist von außen erreichbar. Auf dem Server brauchst du **nur Docker**, kein Node.js.

Platzhalter: `DEINE-IP` = IP des Servers, `finanzklee.de` = deine Domain.

---

## 1. DNS

Beim Domain-Anbieter (bei netcup im CCP unter „Domains“ → „DNS“):

| Typ | Name | Wert |
|---|---|---|
| A | `@` | `DEINE-IP` |
| A | `www` | `DEINE-IP` |

Mit IPv6 zusätzlich zwei AAAA-Einträge. Es kann einige Stunden dauern, bis die Einträge überall gelten.

## 2. Server vorbereiten

Mit dem Server verbinden (`ssh root@DEINE-IP`), dann:

```bash
apt update && apt upgrade -y
```

```bash
apt install -y git ufw unattended-upgrades
```

Firewall: **erst SSH erlauben, dann einschalten**, sonst sperrst du dich aus.

```bash
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable
```

> Docker-Container mit `ports:` umgehen ufw. Deshalb hat in `compose.yml` nur Caddy Ports, App und Datenbank nicht. Füge dort keine `ports:` hinzu.

## 3. Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
```

Prüfen: `docker compose version` muss eine Version anzeigen.

## 4. Projekt holen

```bash
git clone https://github.com/Alllex-kr/4KontenSystem.git /opt/finanzklee
```

```bash
cd /opt/finanzklee
```

Bei einem privaten Repo fragt Git nach einem Passwort. Gib dort einen GitHub **Personal Access Token** ein (Fine-grained, nur dieses Repo, „Contents: Read“).

## 5. `.env` anlegen

```bash
cp .env.example .env
```

Datenbank-Passwort erzeugen und kopieren:

```bash
openssl rand -hex 32
```

```bash
nano .env
```

Diese Werte setzen (die Zeilen `DOMAIN` und `POSTGRES_PASSWORD` dafür auch auskommentieren, also `#` entfernen):

```
DOMAIN="finanzklee.de"
POSTGRES_PASSWORD="das-erzeugte-passwort"
ADMIN_EMAILS="deine@email.de"

IMPRESSUM_NAME="Vorname Nachname"
IMPRESSUM_STREET="Musterstraße 1"
IMPRESSUM_CITY="12345 Musterstadt"
IMPRESSUM_EMAIL="kontakt@finanzklee.de"
HOSTING_PROVIDER="netcup GmbH, Daimlerstraße 25, 76185 Karlsruhe"
```

`DATABASE_URL` und `APP_URL` musst du nicht ändern, das übernimmt `compose.yml`.
Speichern: Strg+O, Enter, Strg+X.

```bash
chmod 600 .env
```

Hast du auch die .com: in der `Caddyfile` die Zeile `www.{$DOMAIN} {` um die weiteren Adressen ergänzen.

## 6. Starten

```bash
docker compose up -d --build
```

Beim ersten Mal dauert der Build einige Minuten. Danach:

```bash
docker compose ps
```

Alle drei Container müssen `running` bzw. `healthy` zeigen. Beim Start spielt die App automatisch die Datenbank-Migrationen ein.

Öffne **https://finanzklee.de**, registriere dich mit der E-Mail aus `ADMIN_EMAILS` (dann bist du Admin) und prüfe `/impressum` und `/datenschutz`: kein roter Hinweis.

> Wenig Arbeitsspeicher (2 GB oder weniger)? Bricht der Build mit `Killed` ab, lege vorher Swap an:
> `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`

## 7. Sicherungen

```bash
./scripts/backup.sh
```

Legt eine komprimierte Datenbank-Sicherung in `backups/` ab und löscht Sicherungen älter als 14 Tage.

**Täglich um 3:30 Uhr automatisch:** `crontab -e`, dann ganz unten einfügen:

```
30 3 * * * /opt/finanzklee/scripts/backup.sh >> /opt/finanzklee/backups/backup.log 2>&1
```

**Kopie außerhalb des Servers:** Fällt der Server aus, sind lokale Sicherungen mit weg. Kopiere `backups/` zusätzlich woanders hin, z. B. mit `rclone` auf eine Storage Box, oder lade sie regelmäßig per WinSCP herunter.

**Zurückspielen** (überschreibt die aktuelle Datenbank):

```bash
./scripts/backup.sh restore backups/finanzklee-JJJJ-MM-TT-HHMMSS.dump
```

Teste das einmal, bevor du es im Ernstfall brauchst.

## 8. Updates einspielen

```bash
cd /opt/finanzklee && ./scripts/backup.sh && git pull && docker compose up -d --build
```

Neue Migrationen spielt die App beim Start selbst ein.

## 9. Vertrag zur Auftragsverarbeitung

Bei netcup im CCP unter „Stammdaten“ bzw. „Auftragsverarbeitung“ abschließen. Die Datenschutzerklärung setzt ihn voraus.

---

## Nützliche Befehle

| Wofür | Befehl |
|---|---|
| Logs der App | `docker compose logs -f app` |
| Logs von Caddy (HTTPS-Probleme) | `docker compose logs -f caddy` |
| Alles neu starten | `docker compose restart` |
| Datenbank-Konsole | `docker compose exec db psql -U finanzklee` |
| Speicherplatz alter Images freigeben | `docker image prune -f` |

## Änderungen an der Datenbank (für Entwickler)

Lokal das Schema in `prisma/schema.prisma` ändern, dann:

```bash
npm run db:migrate -- --name kurze-beschreibung
```

Das erzeugt eine neue Datei in `prisma/migrations/`. Diese mit committen, auf dem Server wird sie beim nächsten Update automatisch eingespielt.
**Nie** `prisma db push` gegen die Server-Datenbank verwenden.
