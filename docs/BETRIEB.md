# FinanzKlee auf dem eigenen Server betreiben

Diese Anleitung geht von einem Linux-Server (Ubuntu/Debian) mit Node.js 20 oder neuer aus.
Platzhalter: `finanzklee.de` = deine Domain, `/opt/finanzklee` = Projektordner.

## 1. Projekt holen und einrichten

```bash
git clone https://github.com/Alllex-kr/4KontenSystem.git /opt/finanzklee
cd /opt/finanzklee
npm ci
cp .env.example .env
```

In der `.env` mindestens setzen:

| Variable | Wert |
| --- | --- |
| `DATABASE_URL` | `file:./prod.db` |
| `APP_URL` | `https://finanzklee.de` |
| `ADMIN_EMAILS` | deine E-Mail-Adresse |
| `IMPRESSUM_NAME`, `IMPRESSUM_STREET`, `IMPRESSUM_CITY`, `IMPRESSUM_EMAIL` | deine Angaben für das Impressum |
| `HOSTING_PROVIDER` | Name und Adresse deines Server-Anbieters |
| `BANKING_ENCRYPTION_KEY` | nur mit finAPI: `openssl rand -base64 32` |

Fehlt eine Impressum-Angabe, zeigen `/impressum` und `/datenschutz` einen roten Hinweis.

```bash
npm run db:push
npm run build
```

## 2. App dauerhaft starten (systemd)

`/etc/systemd/system/finanzklee.service`:

```ini
[Unit]
Description=FinanzKlee
After=network.target

[Service]
WorkingDirectory=/opt/finanzklee
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=always
User=finanzklee

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now finanzklee
```

`-H 127.0.0.1` ist wichtig: Die App ist dann nur über den Reverse Proxy erreichbar.
Die Login-Sperre verlässt sich darauf, dass die IP-Adresse vom Proxy kommt.

## 3. HTTPS mit Caddy

Caddy holt das Zertifikat automatisch. `/etc/caddy/Caddyfile`:

```
finanzklee.de {
	reverse_proxy 127.0.0.1:3000
	log {
		output file /var/log/caddy/finanzklee.log {
			roll_keep_for 336h
		}
	}
}

www.finanzklee.de, finanzklee.com, www.finanzklee.com {
	redir https://finanzklee.de{uri} permanent
}
```

`roll_keep_for 336h` löscht Zugriffsprotokolle nach 14 Tagen, so wie es in der Datenschutzerklärung steht.

## 4. Sicherungen

```bash
npm run backup
```

Legt eine gepackte Kopie der Datenbank in `backups/` ab und löscht Kopien, die älter als 14 Tage sind.
Die Sicherung funktioniert auch, während die App läuft.

**Täglich automatisch** (um 3:30 Uhr), mit `crontab -e` als Benutzer `finanzklee`:

```
30 3 * * * cd /opt/finanzklee && /usr/bin/npm run backup >> /var/log/finanzklee-backup.log 2>&1
```

**Wichtig: Kopie außerhalb des Servers.** Fällt der Server aus, sind lokale Sicherungen mit weg.
Kopiere `backups/` zusätzlich woanders hin, z. B. mit `rclone` auf eine Hetzner Storage Box oder einen S3-Speicher:

```
45 3 * * * rclone sync /opt/finanzklee/backups storagebox:finanzklee-backups
```

### Sicherung zurückspielen

```bash
sudo systemctl stop finanzklee
cd /opt/finanzklee/prisma
cp prod.db prod.db.vorher
gunzip -c ../backups/finanzklee-JJJJ-MM-TT-....db.gz > prod.db
sudo systemctl start finanzklee
```

Teste das einmal, bevor du es im Ernstfall brauchst.

## 5. Updates einspielen

```bash
cd /opt/finanzklee
npm run backup
git pull
npm ci
npm run db:push
npm run build
sudo systemctl restart finanzklee
```
