// E-Mail-Versand über SMTP (anbieterunabhängig: netcup-Postfach, Brevo, Mailjet, Amazon SES …).
// Ohne SMTP-Einstellungen wird in der Entwicklung nur ins Terminal geschrieben, damit du Links testen kannst.
import nodemailer, { type Transporter } from "nodemailer";
import { BRAND } from "./brand";

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

/** Ob E-Mail-Funktionen (Bestätigung, Passwort zurücksetzen) genutzt werden können. */
export function mailUsable() {
  return mailConfigured() || process.env.NODE_ENV !== "production";
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 = direkt verschlüsselt, sonst STARTTLS (wird erzwungen)
      secure: port === 465,
      requireTLS: port !== 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    });
  }
  return transporter;
}

export type Mail = { to: string; subject: string; text: string; html: string };

/** Sendet eine E-Mail. Gibt false zurück, wenn kein Versand eingerichtet ist oder er fehlschlug. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[Mail] SMTP ist nicht eingerichtet (SMTP_HOST, MAIL_FROM). E-Mail „${mail.subject}“ wurde nicht gesendet.`);
    } else {
      console.info(`\n[Mail] Kein SMTP eingerichtet, Entwicklungsmodus. Diese E-Mail wäre gesendet worden:\nAn: ${mail.to}\nBetreff: ${mail.subject}\n\n${mail.text}\n`);
    }
    return false;
  }
  try {
    await getTransporter().sendMail({ from: process.env.MAIL_FROM, ...mail });
    return true;
  } catch (e) {
    // Empfänger und Inhalt nicht loggen (enthält ggf. Einmal-Links)
    console.error("[Mail] Versand fehlgeschlagen:", e instanceof Error ? e.message : e);
    return false;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Einfache E-Mail mit Text, einem Button und Hinweis. Funktioniert in allen gängigen Mailprogrammen. */
export function buttonMail(opts: { to: string; subject: string; greeting: string; intro: string; button: string; url: string; outro: string }): Mail {
  const text = `${opts.greeting}\n\n${opts.intro}\n\n${opts.url}\n\n${opts.outro}\n\n${BRAND.name}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f3;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2b22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="font-size:20px;font-weight:800;margin:0 0 20px;color:${BRAND.primary}">🍀 ${BRAND.name}</p>
<p style="font-size:16px;margin:0 0 12px">${escapeHtml(opts.greeting)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${escapeHtml(opts.button)}</a></p>
<p style="font-size:13px;line-height:1.6;color:#55645c;margin:0">${escapeHtml(opts.outro)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
}
