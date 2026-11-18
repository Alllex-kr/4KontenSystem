# Anmeldung mit Google einrichten

Vierklee bietet „Mit Google anmelden“ und „Mit Google registrieren“ an, sobald zwei Werte in der `.env` stehen. Ohne sie bleibt der Button ausgeblendet und alles läuft wie bisher mit E-Mail und Passwort.

## 1. Zugangsdaten bei Google anlegen (einmalig, ca. 10 Minuten)

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen und ein Projekt anlegen (z. B. „Vierklee“).
2. **APIs & Dienste → OAuth-Zustimmungsbildschirm** (bzw. „Google Auth Platform → Branding“):
   - Nutzertyp **Extern**
   - App-Name „Vierklee“, Support-E-Mail, optional Logo
   - Bereiche: `openid`, `email`, `profile` (die Standardbereiche, keine Prüfung durch Google nötig)
   - Solange die App im Status **Test** ist, können sich nur eingetragene Testnutzer anmelden. Für alle: **App veröffentlichen**.
3. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**:
   - Anwendungstyp **Webanwendung**
   - **Autorisierte Weiterleitungs-URIs** (exakt so, ohne Schrägstrich am Ende):
     - lokal: `http://localhost:3000/api/auth/google/callback`
     - live: `https://deine-domain.de/api/auth/google/callback`
4. Client-ID und Clientschlüssel kopieren.

## 2. In die `.env` eintragen

```env
APP_URL="http://localhost:3000"          # live: https://deine-domain.de
GOOGLE_CLIENT_ID="…apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="…"
```

Server neu starten. Auf `/login` und `/register` erscheint dann der Google-Button.

`APP_URL` muss genau zu einer der Weiterleitungs-URIs passen, sonst meldet Google `redirect_uri_mismatch`.

## So verhält sich die Anmeldung

| Fall | Ergebnis |
|---|---|
| Google-Konto ist schon mit Vierklee verknüpft | Anmeldung |
| Es gibt ein Vierklee-Konto mit derselben E-Mail (bei Google bestätigt) | Wird verknüpft, danach geht beides: Passwort und Google |
| Neue E-Mail | Neues Konto ohne Passwort, Name = Vorname aus Google, Standard-Abo |
| E-Mail bei Google nicht bestätigt | Abgelehnt (Schutz vor Kontoübernahme) |
| Konto gesperrt | Abgelehnt |

Konten ohne Passwort können sich nur mit Google anmelden. Versucht jemand es mit Passwort, weist Vierklee auf Google hin. Im Adminbereich steht beim Nutzer unter „Anmeldung“, ob Passwort, Google oder beides.

## Technik

- OpenID Connect, Authorization Code Flow mit PKCE, `state` und `nonce`, ohne Zusatzbibliothek: `src/lib/oauth/google.ts`
- Konto finden, verknüpfen oder anlegen: `src/lib/oauth/signin.ts`
- Routen: `/api/auth/google` (Start) und `/api/auth/google/callback` (Rückkehr)
- Danach die normale Vierklee-Sitzung (Cookie `vks_session`), Google-Tokens werden nicht gespeichert.
