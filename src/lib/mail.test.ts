import { describe, expect, it } from "vitest";
import { buttonMail } from "./mail";

describe("E-Mail-Vorlage", () => {
  const mail = buttonMail({
    to: "lea@example.test",
    subject: "Betreff",
    greeting: 'Hallo <script>alert("x")</script>,',
    intro: "Text & mehr",
    button: "Klick",
    url: "https://finanzklee.de/passwort-neu?token=abc",
    outro: "Ende",
  });

  it("maskiert Nutzereingaben im HTML (der Name kommt vom Nutzer)", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("Text &amp; mehr");
  });

  it("enthält den Link im Text und als Button", () => {
    expect(mail.text).toContain("https://finanzklee.de/passwort-neu?token=abc");
    expect(mail.html).toContain('href="https://finanzklee.de/passwort-neu?token=abc"');
  });
});
