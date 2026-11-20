import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter, waitMinutes } from "./rateLimit";

describe("Versuchsbegrenzung", () => {
  const limit = { max: 3, windowMs: 1000 };

  it("sperrt nach zu vielen Versuchen und gibt nach Ablauf wieder frei", () => {
    let t = 0;
    const rl = createRateLimiter(() => t);
    for (let i = 0; i < 3; i++) {
      expect(rl.blockedFor("a", limit)).toBe(0);
      rl.hit("a", limit);
    }
    expect(rl.blockedFor("a", limit)).toBe(1000);
    expect(rl.blockedFor("b", limit)).toBe(0);
    t = 400;
    expect(rl.blockedFor("a", limit)).toBe(600);
    t = 1000;
    expect(rl.blockedFor("a", limit)).toBe(0);
    rl.hit("a", limit);
    expect(rl.blockedFor("a", limit)).toBe(0);
  });

  it("setzt nach Erfolg zurück", () => {
    const rl = createRateLimiter(() => 0);
    for (let i = 0; i < 3; i++) rl.hit("a", limit);
    rl.reset("a");
    expect(rl.blockedFor("a", limit)).toBe(0);
  });

  it("rundet die Wartezeit auf ganze Minuten", () => {
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(14 * 60_000 + 1)).toBe(15);
  });

  it("nimmt die IP, die der eigene Proxy angehängt hat", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientIp(new Headers())).toBe("unbekannt");
  });
});
