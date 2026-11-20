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

**E-Mail-Versand** (für Bestätigungs-E-Mails und „Passwort vergessen“). Ohne diese Werte können sich Nutzer, die
ihr Passwort vergessen haben, nicht mehr selbst helfen:

```
SMTP_HOST="smtp.example.de"
SMTP_PORT="587"
SMTP_USER="noreply@finanzklee.de"
SMTP_PASS="…"
MAIL_FROM="FinanzKlee <noreply@finanzklee.de>"
MAIL_PROVIDER="Name und Adresse des Anbieters"
```

Bei netcup legst du im Webhosting- oder Mail-Paket ein Postfach `noreply@finanzklee.de` an, die SMTP-Daten
stehen dort. Für viele Nutzer ist ein Versanddienst zuverlässiger (bessere Zustellung, kein Spam-Ordner),
z. B. Brevo, Mailjet oder Amazon SES (alle mit EU-Rechenzentrum). Richte beim Domain-Anbieter die
DNS-Einträge ein, die der Dienst vorgibt (SPF, DKIM), sonst landen die E-Mails im Spam.

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

Am besten automatisch, siehe Abschnitt 10. Von Hand (der Server baut das Image dann selbst):

```bash
cd /opt/finanzklee && ./scripts/backup.sh && git pull && docker compose up -d --build
```

Neue Migrationen spielt die App beim Start selbst ein.

## 9. Vertrag zur Auftragsverarbeitung

Bei netcup im CCP unter „Stammdaten“ bzw. „Auftragsverarbeitung“ abschließen. Die Datenschutzerklärung setzt ihn voraus.

## 10. Automatisch ausrollen mit GitHub Actions

Danach gilt: **Push auf `main` → Tests → Docker-Image wird gebaut → Server holt es sich.**
Sind die Tests rot, wird nichts ausgerollt. Startet die neue Version nicht sauber, kehrt der Server von selbst
zur vorherigen zurück (`scripts/deploy.sh`). Vor jedem Update wird die Datenbank gesichert.

Ohne diese Einrichtung prüft GitHub Actions trotzdem jeden Push und baut das Image, rollt aber nicht aus.

### 10.1 Benutzer für das Ausrollen anlegen (auf dem Server)

GitHub soll sich nicht als `root` anmelden, sondern als eigener Benutzer mit genau den nötigen Rechten.

```bash
adduser --disabled-password --gecos "" deploy
```

```bash
usermod -aG docker deploy && chown -R deploy:deploy /opt/finanzklee
```

Die tägliche Sicherung ab jetzt als `deploy` ausführen: bei `root` entfernen (`crontab -e`, Zeile löschen) und
bei `deploy` eintragen:

```bash
crontab -u deploy -e
```

```
30 3 * * * /opt/finanzklee/scripts/backup.sh >> /opt/finanzklee/backups/backup.log 2>&1
```

### 10.2 SSH-Schlüssel erzeugen (auf deinem PC)

In PowerShell, **ohne Passphrase** (einfach Enter drücken, GitHub kann keine eingeben):

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f finanzklee-deploy
```

Das erzeugt zwei Dateien: `finanzklee-deploy` (privat, geht nur zu GitHub) und `finanzklee-deploy.pub` (öffentlich, geht auf den Server).

Inhalt von `finanzklee-deploy.pub` anzeigen und kopieren:

```bash
type finanzklee-deploy.pub
```

Auf dem Server einfügen:

```bash
mkdir -p /home/deploy/.ssh && nano /home/deploy/.ssh/authorized_keys
```

```bash
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Test vom PC aus (muss ohne Passwort klappen):

```bash
ssh -i finanzklee-deploy deploy@DEINE-IP "docker compose version"
```

### 10.3 Server-Fingerabdruck ermitteln (auf deinem PC)

Damit sich GitHub nur mit **deinem** Server verbindet und nicht mit einem untergeschobenen:

```bash
ssh-keyscan -t ed25519 DEINE-IP
```

Die ausgegebene Zeile (beginnt mit der IP) kopieren.

### 10.4 In GitHub eintragen

Im Repository unter **Settings → Environments → New environment**, Name: `production`. Dort unter
**Environment secrets** anlegen:

| Secret | Inhalt |
|---|---|
| `DEPLOY_HOST` | `DEINE-IP` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | kompletter Inhalt der Datei `finanzklee-deploy` (inkl. `-----BEGIN…` und `-----END…`) |
| `DEPLOY_KNOWN_HOSTS` | die Zeile aus 10.3 |

Dann unter **Settings → Secrets and variables → Actions → Variables** anlegen:

| Variable | Wert |
|---|---|
| `DEPLOY_ENABLED` | `true` |
| `APP_URL` | `https://finanzklee.de` |

Danach die Datei `finanzklee-deploy` auf deinem PC an einem sicheren Ort aufbewahren oder löschen.
Wer sie hat, kann auf deinem Server Updates einspielen.

### 10.5 Testen

Unter **Actions → Deploy → Run workflow** einmal von Hand starten. Alle drei Schritte (CI, Docker-Image,
Auf Server ausrollen) müssen grün werden.

Tipp: Unter deinem GitHub-Profil → **Packages** → `4kontensystem` → **Package settings** die Sichtbarkeit auf
**Public** stellen (der Code ist ohnehin öffentlich). Dann kann der Server Images auch ohne Anmeldung laden,
z. B. beim Zurückspringen auf eine ältere Version von Hand.

### 10.6 Empfohlen: `main` schützen

Unter **Settings → Branches → Add branch ruleset** für `main`:
- **Require a pull request before merging**
- **Require status checks to pass** → `CI / Prüfen und bauen` auswählen

Dann landen Änderungen nur noch über Pull Requests mit grünen Tests auf `main` und damit auf dem Server.
Für dich heißt das: Neue Arbeit auf einem eigenen Branch, Pull Request öffnen, nach grünem CI zusammenführen.

### Zurück auf eine ältere Version

Jedes Image ist mit seinem Commit markiert. Auf dem Server:

```bash
cd /opt/finanzklee && ./scripts/deploy.sh ghcr.io/alllex-kr/4kontensystem:<commit-hash>
```

Achtung: Datenbank-Migrationen werden dabei nicht zurückgedreht. Bei Problemen nach einer Migration lieber
mit einem neuen Commit nach vorne korrigieren.

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
