import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS,
  DEFAULT_PLANS,
  LEGACY_SET_KEYS,
  LOCKED_SET_GROUP_KEYS,
  PERMISSION_KEYS,
  SYSTEM_SET_GROUPS,
  isFunctionSetKey,
  isPermissionKey,
  permissionsByCategory,
} from "./catalog";

const group = (key: string) => SYSTEM_SET_GROUPS.find((g) => g.key === key)!;

describe("Berechtigungskatalog", () => {
  it("erkennt nur bekannte Schlüssel", () => {
    expect(isPermissionKey("ai.categorize")).toBe(true);
    expect(isPermissionKey("gibt.es.nicht")).toBe(false);
  });

  it("Funktionssätze haben den Schlüssel ihrer Berechtigung, eigene Sätze keinen", () => {
    expect(isFunctionSetKey("import.csv")).toBe(true);
    expect(isFunctionSetKey(null)).toBe(false);
    expect(isFunctionSetKey("admin")).toBe(false);
  });

  it("die geschützte Admin-Satzgruppe enthält alle Admin-Berechtigungen", () => {
    expect(LOCKED_SET_GROUP_KEYS).toEqual(["admin"]);
    expect([...group("admin").sets].sort()).toEqual([...ADMIN_PERMISSIONS].sort());
  });

  it("jede Funktion ohne Admin steckt in mindestens einer Satzgruppe", () => {
    const covered = new Set(SYSTEM_SET_GROUPS.flatMap((g) => g.sets));
    for (const k of PERMISSION_KEYS) expect(covered.has(k), k).toBe(true);
  });

  it("Kostenlos bekommt alles außer KI und Admin, Plus zusätzlich das KI-Paket", () => {
    const inPlan = (plan: string) => new Set(SYSTEM_SET_GROUPS.filter((g) => g.plans.includes(plan)).flatMap((g) => g.sets));
    const free = inPlan("free");
    const plus = inPlan("plus");
    expect(free.has("ai.categorize")).toBe(false);
    expect(plus.has("ai.categorize")).toBe(true);
    for (const k of ADMIN_PERMISSIONS) {
      expect(free.has(k)).toBe(false);
      expect(plus.has(k)).toBe(false);
    }
    for (const k of free) expect(plus.has(k)).toBe(true);
    expect(DEFAULT_PLANS.filter((p) => p.isDefault).map((p) => p.key)).toEqual(["free"]);
  });

  it("alte Sammel-Sätze haben eine gleichnamige Satzgruppe als Ziel", () => {
    for (const k of LEGACY_SET_KEYS) expect(SYSTEM_SET_GROUPS.some((g) => g.key === k)).toBe(true);
  });

  it("gruppiert jede Berechtigung genau einmal", () => {
    const all = permissionsByCategory().flatMap(([, items]) => items.map((i) => i.key));
    expect(all.sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});

describe("Abo Administrator", () => {
  it("ist ein eigenes, nicht buchbares System-Abo und nicht das Standard-Abo", async () => {
    const { ADMIN_PLAN } = await import("./catalog");
    expect(ADMIN_PLAN.key).toBe("admin");
    expect(DEFAULT_PLANS.some((p) => p.key === ADMIN_PLAN.key)).toBe(false);
  });

  it("Admin-Rechte als Satzgruppe heißen anders als das Abo", async () => {
    const { ADMIN_PLAN } = await import("./catalog");
    expect(group("admin").name).not.toBe(ADMIN_PLAN.name);
  });
});
