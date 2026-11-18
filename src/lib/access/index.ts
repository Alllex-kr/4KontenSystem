import { redirect } from "next/navigation";
import { cache } from "react";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { getCurrentUser } from "../auth";
import { ADMIN_PLAN, DEFAULT_PLANS, LEGACY_SET_KEYS, PERMISSIONS, PERMISSION_KEYS, SYSTEM_SET_GROUPS, isPermissionKey, type PermissionKey } from "./catalog";

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Grunddaten anlegen (Abos, ein Satz pro Funktion, System-Satzgruppen).
// Idempotent, einmal pro Prozess.
// ---------------------------------------------------------------------------

let setupDone: Promise<void> | null = null;

export function ensureAccessSetup() {
  setupDone ??= runSetup().catch((e) => {
    setupDone = null;
    throw e;
  });
  return setupDone;
}

async function runSetup() {
  // 1. Start-Abos
  if ((await prisma.plan.count()) === 0) {
    for (const p of DEFAULT_PLANS) await prisma.plan.create({ data: p });
  }

  // 1b. Abo "Administrator" mit Vollzugriff (immer vorhanden)
  const adminPlan = await prisma.plan.findUnique({ where: { key: ADMIN_PLAN.key } });
  if (!adminPlan) {
    const taken = await prisma.plan.findFirst({ where: { name: ADMIN_PLAN.name } });
    await prisma.plan.create({
      data: { ...ADMIN_PLAN, name: taken ? `${ADMIN_PLAN.name} (System)` : ADMIN_PLAN.name, allAccess: true, isDefault: false, priceCents: 0 },
    });
  } else if (!adminPlan.allAccess || adminPlan.isDefault) {
    await prisma.plan.update({ where: { id: adminPlan.id }, data: { allAccess: true, isDefault: false } });
  }
  // Konten aus ADMIN_EMAILS gleich beim Start ins Abo "Administrator" setzen
  const adminEmails = envAdminEmails();
  if (adminEmails.length) {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: ADMIN_PLAN.key } });
    await prisma.user.updateMany({ where: { email: { in: adminEmails }, NOT: { planId: plan.id } }, data: { planId: plan.id } });
    await prisma.user.updateMany({ where: { email: { in: adminEmails }, planId: null }, data: { planId: plan.id } });
  }

  // 2. Ein Berechtigungssatz pro Funktion, Inhalt immer genau diese Berechtigung
  const fnSetIds = new Map<PermissionKey, string>();
  for (const key of PERMISSION_KEYS) {
    let set = await prisma.permissionSet.findUnique({ where: { key } });
    if (!set) {
      const def = PERMISSIONS[key];
      const taken = await prisma.permissionSet.findUnique({ where: { name: def.label } });
      set = await prisma.permissionSet.create({ data: { key, name: taken ? `${def.label} (Funktion)` : def.label, description: def.description } });
    }
    await prisma.$transaction([
      prisma.permissionSetPermission.deleteMany({ where: { setId: set.id, permissionKey: { not: key } } }),
      prisma.permissionSetPermission.upsert({
        where: { setId_permissionKey: { setId: set.id, permissionKey: key } },
        update: {},
        create: { setId: set.id, permissionKey: key },
      }),
    ]);
    fnSetIds.set(key, set.id);
  }

  // 3. System-Satzgruppen. Beim ersten Anlegen kommen sie in die vorgesehenen Abos.
  const plans = await prisma.plan.findMany({ select: { id: true, key: true } });
  for (const g of SYSTEM_SET_GROUPS) {
    const setIds = g.sets.map((k) => fnSetIds.get(k)!);
    const existing = await prisma.permissionSetGroup.findUnique({ where: { key: g.key } });
    if (!existing) {
      const taken = await prisma.permissionSetGroup.findUnique({ where: { name: g.name } });
      await prisma.permissionSetGroup.create({
        data: {
          key: g.key,
          name: taken ? `${g.name} (System)` : g.name,
          description: g.description,
          sets: { create: setIds.map((setId) => ({ setId })) },
          plans: { create: plans.filter((p) => g.plans.includes(p.key)).map((p) => ({ planId: p.id })) },
        },
      });
    } else if (g.locked) {
      // Geschützte Gruppe: Name und Inhalt wie im Katalog
      if (existing.name !== g.name && !(await prisma.permissionSetGroup.findUnique({ where: { name: g.name } }))) {
        await prisma.permissionSetGroup.update({ where: { id: existing.id }, data: { name: g.name } });
      }
      await prisma.$transaction([
        prisma.setGroupItem.deleteMany({ where: { setGroupId: existing.id, setId: { notIn: setIds } } }),
        ...setIds.map((setId) =>
          prisma.setGroupItem.upsert({
            where: { setGroupId_setId: { setGroupId: existing.id, setId } },
            update: {},
            create: { setGroupId: existing.id, setId },
          }),
        ),
      ]);
    }
  }

  // 4. Alte Sammel-Sätze der ersten Version ("admin", "ai") in die gleichnamige Satzgruppe überführen
  for (const legacyKey of LEGACY_SET_KEYS) {
    const legacy = await prisma.permissionSet.findUnique({ where: { key: legacyKey }, include: { plans: true, groups: true, users: true } });
    const target = legacy && (await prisma.permissionSetGroup.findUnique({ where: { key: legacyKey } }));
    if (!legacy || !target) continue;
    const setGroupId = target.id;
    await prisma.$transaction([
      ...legacy.plans.map((p) =>
        prisma.planSetGroup.upsert({ where: { planId_setGroupId: { planId: p.planId, setGroupId } }, update: {}, create: { planId: p.planId, setGroupId } }),
      ),
      ...legacy.groups.map((g) =>
        prisma.userGroupSetGroup.upsert({ where: { groupId_setGroupId: { groupId: g.groupId, setGroupId } }, update: {}, create: { groupId: g.groupId, setGroupId } }),
      ),
      ...legacy.users.map((u) =>
        prisma.userSetGroup.upsert({
          where: { userId_setGroupId: { userId: u.userId, setGroupId } },
          update: {},
          create: { userId: u.userId, setGroupId, expiresAt: u.expiresAt, grantedById: u.grantedById },
        }),
      ),
      prisma.permissionSet.delete({ where: { id: legacy.id } }),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Effektive Berechtigungen eines Nutzers
// ---------------------------------------------------------------------------

/** via = Name der Satzgruppe, über die der Satz kam (leer = Satz direkt zugewiesen) */
export type AccessSource =
  | { kind: "plan"; name: string; setName: string; via?: string }
  | { kind: "group"; name: string; setName: string; via?: string }
  | { kind: "direct"; setName: string; via?: string; expiresAt: Date | null }
  | { kind: "env" };

export type UserAccess = {
  /** isFallback = Standard-Abo, weil keins gesetzt ist. viaEnv = über ADMIN_EMAILS festgelegt */
  plan: { id: string; name: string; key: string; isFallback: boolean; allAccess: boolean; viaEnv: boolean } | null;
  permissions: Map<PermissionKey, AccessSource[]>;
};

/** E-Mail-Adressen aus ADMIN_EMAILS (.env) haben immer Adminrechte. Schutz davor, sich auszusperren. */
function envAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEnvAdmin(email: string) {
  return envAdminEmails().includes(email.toLowerCase());
}

const setInclude = { set: { include: { permissions: true } } } as const;
const setGroupInclude = { setGroup: { include: { sets: { include: setInclude } } } } as const;
const planInclude = { sets: { include: setInclude }, setGroups: { include: setGroupInclude } } as const;

type SetLike = { set: { name: string; permissions: { permissionKey: string }[] } };
type GroupLike = { setGroup: { name: string; sets: SetLike[] } };

export async function loadAccess(userId: string, db: Db = prisma): Promise<UserAccess> {
  await ensureAccessSetup();
  const now = new Date();
  const valid = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      plan: { include: planInclude },
      groups: { include: { group: { include: { sets: { include: setInclude }, setGroups: { include: setGroupInclude } } } } },
      permissionSets: { where: valid, include: setInclude },
      setGroups: { where: valid, include: setGroupInclude },
    },
  });
  const permissions = new Map<PermissionKey, AccessSource[]>();
  if (!user) return { plan: null, permissions };

  const add = (keys: { permissionKey: string }[], source: AccessSource) => {
    for (const { permissionKey } of keys) {
      if (!isPermissionKey(permissionKey)) continue; // Schlüssel, die es im Code nicht (mehr) gibt
      permissions.set(permissionKey, [...(permissions.get(permissionKey) ?? []), source]);
    }
  };
  const addAll = (sets: SetLike[], setGroups: GroupLike[], make: (setName: string, via?: string) => AccessSource) => {
    for (const s of sets) add(s.set.permissions, make(s.set.name));
    for (const g of setGroups) for (const s of g.setGroup.sets) add(s.set.permissions, make(s.set.name, g.setGroup.name));
  };

  const envAdmin = isEnvAdmin(user.email);
  let plan = user.plan;
  if (envAdmin && !plan?.allAccess) {
    // ADMIN_EMAILS: immer im Abo "Administrator". Wird gespeichert, damit Listen und Zähler stimmen.
    const adminPlan = await db.plan.findUnique({ where: { key: ADMIN_PLAN.key }, include: planInclude });
    if (adminPlan) {
      await db.user.update({ where: { id: userId }, data: { planId: adminPlan.id } });
      plan = adminPlan;
    }
  }
  plan ??= await db.plan.findFirst({ where: { isDefault: true }, include: planInclude });
  if (plan?.allAccess) {
    // Vollzugriff: jede Berechtigung aus dem Katalog, auch künftige
    const name = plan.name;
    add(PERMISSION_KEYS.map((permissionKey) => ({ permissionKey })), { kind: "plan", name, setName: "Vollzugriff" });
  } else if (plan) {
    const name = plan.name;
    addAll(plan.sets, plan.setGroups, (setName, via) => ({ kind: "plan", name, setName, via }));
  }
  for (const m of user.groups) addAll(m.group.sets, m.group.setGroups, (setName, via) => ({ kind: "group", name: m.group.name, setName, via }));
  for (const us of user.permissionSets) add(us.set.permissions, { kind: "direct", setName: us.set.name, expiresAt: us.expiresAt });
  for (const ug of user.setGroups)
    for (const s of ug.setGroup.sets) add(s.set.permissions, { kind: "direct", setName: s.set.name, via: ug.setGroup.name, expiresAt: ug.expiresAt });
  // Notfall: Abo "Administrator" fehlt → ADMIN_EMAILS bekommt trotzdem alles
  if (envAdmin && !plan?.allAccess) add(PERMISSION_KEYS.map((permissionKey) => ({ permissionKey })), { kind: "env" });

  return {
    plan: plan ? { id: plan.id, name: plan.name, key: plan.key, isFallback: !user.plan && !envAdmin, allAccess: plan.allAccess, viaEnv: envAdmin } : null,
    permissions,
  };
}

/** Pro Anfrage zwischengespeichert. */
export const getAccess = cache((userId: string) => loadAccess(userId));

export async function can(userId: string, key: PermissionKey) {
  return (await getAccess(userId)).permissions.has(key);
}

/** Alle effektiven Berechtigungsschlüssel (z. B. für die Navigation). */
export async function permissionKeys(userId: string) {
  return [...(await getAccess(userId)).permissions.keys()];
}

/** Für Seiten: ohne Berechtigung zurück zum Dashboard. */
export async function requirePermission(key: PermissionKey) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user.id, key))) redirect("/dashboard");
  return user;
}

/** Für Server Actions: liefert den Nutzer oder null (dann Fehlermeldung zurückgeben). */
export async function userWithPermission(key: PermissionKey) {
  const user = await getCurrentUser();
  if (!user || !(await can(user.id, key))) return null;
  return user;
}

export const FEATURE_LOCKED = "Diese Funktion ist in deinem Abo nicht enthalten.";

/** Für Server Actions ohne Rückgabe-Objekt: wirft, wenn die Berechtigung fehlt. */
export async function requireFeature(key: PermissionKey) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user.id, key))) throw new Error(FEATURE_LOCKED);
  return user;
}

export const permissionLabel = (key: PermissionKey) => PERMISSIONS[key].label;

export function describeSource(s: AccessSource) {
  const via = s.kind !== "env" && s.via ? ` → ${s.via}` : "";
  switch (s.kind) {
    case "plan":
      return `Abo „${s.name}“${via} → ${s.setName}`;
    case "group":
      return `Personengruppe „${s.name}“${via} → ${s.setName}`;
    case "direct":
      return `Direkt${s.via ? `: ${s.via}` : ""} → ${s.setName}${s.expiresAt ? ` (bis ${s.expiresAt.toLocaleDateString("de-DE")})` : ""}`;
    case "env":
      return "ADMIN_EMAILS in der .env";
  }
}
