"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAccess, isEnvAdmin, loadAccess, userWithPermission } from "@/lib/access";
import { ADMIN_PERMISSIONS, LOCKED_SET_GROUP_KEYS, PERMISSIONS, isFunctionSetKey, isPermissionKey } from "@/lib/access/catalog";
import { parseEuroToCents } from "@/lib/format";
import type { ActionState } from "./types";

type Actor = { id: string; name: string };
type Tx = Prisma.TransactionClient;

const NO_RIGHTS: ActionState = { error: "Dafür fehlt dir die Berechtigung." };

class LockoutError extends Error {}

/**
 * Führt eine Änderung aus und prüft danach, ob du dir selbst Adminrechte entzogen hättest.
 * Falls ja, wird alles zurückgerollt. So bleibt immer mindestens ein Admin übrig.
 */
async function guarded(actor: Actor, fn: (tx: Tx) => Promise<void>): Promise<string | null> {
  const before = await getAccess(actor.id);
  const had = ADMIN_PERMISSIONS.filter((k) => before.permissions.has(k));
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      const after = await loadAccess(actor.id, tx);
      if (had.some((k) => !after.permissions.has(k))) throw new LockoutError();
    });
    return null;
  } catch (e) {
    if (e instanceof LockoutError) return "Damit würdest du dir selbst Adminrechte entziehen. Das geht nur über einen anderen Admin.";
    if (e instanceof Error && "code" in e && e.code === "P2002") return "Dieser Name ist schon vergeben.";
    throw e;
  }
}

function audit(tx: Tx, actor: Actor, action: string, detail = "", targetUserId?: string) {
  return tx.adminAuditLog.create({ data: { actorId: actor.id, actorName: actor.name, action, detail, targetUserId } });
}

const refresh = () => revalidatePath("/", "layout");
const listDiff = (label: string, before: string[], after: string[]) => {
  const added = after.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !after.includes(x));
  return [added.length ? `${label} +${added.join(", +")}` : "", removed.length ? `${label} −${removed.join(", −")}` : ""].filter(Boolean);
};

// ---------------------------------------------------------------------------
// Nutzer
// ---------------------------------------------------------------------------

/** Liest Ablaufdaten aus Feldern wie exp_<id>. Fehlermeldung als string. */
function readExpiries(formData: FormData, prefix: string, ids: string[]): Record<string, Date | null> | string {
  const out: Record<string, Date | null> = {};
  for (const id of ids) {
    const raw = String(formData.get(`${prefix}${id}`) ?? "");
    if (!raw) out[id] = null;
    else {
      const d = new Date(`${raw}T23:59:59`);
      if (Number.isNaN(d.getTime())) return "Ungültiges Ablaufdatum.";
      if (d < new Date()) return "Ein Ablaufdatum liegt in der Vergangenheit.";
      out[id] = d;
    }
  }
  return out;
}

export async function saveUserAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.users");
  if (!actor) return NO_RIGHTS;
  const userId = String(formData.get("userId") ?? "");
  let planId = String(formData.get("planId") ?? "") || null;
  const setIds = formData.getAll("set").map(String);
  const setGroupIds = formData.getAll("setGroup").map(String);
  const groupIds = formData.getAll("group").map(String);

  const expires = readExpiries(formData, "exp_", setIds);
  if (typeof expires === "string") return { error: expires };
  const gExpires = readExpiries(formData, "gexp_", setGroupIds);
  if (typeof gExpires === "string") return { error: gExpires };

  const [target, plans, sets, setGroups, groups] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { permissionSets: true, setGroups: true, groups: true } }),
    prisma.plan.findMany(),
    prisma.permissionSet.findMany(),
    prisma.permissionSetGroup.findMany(),
    prisma.userGroup.findMany(),
  ]);
  if (!target) return { error: "Nutzer nicht gefunden." };
  if (planId && !plans.some((p) => p.id === planId)) return { error: "Abo nicht gefunden." };
  // ADMIN_EMAILS: Abo bleibt immer "Administrator", Auswahl wird ignoriert
  if (isEnvAdmin(target.email)) planId = target.planId;
  if (
    setIds.some((id) => !sets.some((s) => s.id === id)) ||
    setGroupIds.some((id) => !setGroups.some((g) => g.id === id)) ||
    groupIds.some((id) => !groups.some((g) => g.id === id))
  )
    return { error: "Ungültige Auswahl." };

  const nameOf = (list: { id: string; name: string }[]) => (id: string) => list.find((x) => x.id === id)?.name ?? id;
  const planName = (id: string | null) => (id ? nameOf(plans)(id) : "Standard");
  const changes = [
    target.planId !== planId ? `Abo: ${planName(target.planId)} → ${planName(planId)}` : "",
    ...listDiff("Satzgruppe", target.setGroups.map((s) => nameOf(setGroups)(s.setGroupId)), setGroupIds.map(nameOf(setGroups))),
    ...listDiff("Satz", target.permissionSets.map((s) => nameOf(sets)(s.setId)), setIds.map(nameOf(sets))),
    ...listDiff("Personengruppe", target.groups.map((g) => nameOf(groups)(g.groupId)), groupIds.map(nameOf(groups))),
  ].filter(Boolean);

  const error = await guarded(actor, async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { planId } });
    await tx.userPermissionSet.deleteMany({ where: { userId, setId: { notIn: setIds } } });
    for (const setId of setIds) {
      await tx.userPermissionSet.upsert({
        where: { userId_setId: { userId, setId } },
        update: { expiresAt: expires[setId] },
        create: { userId, setId, expiresAt: expires[setId], grantedById: actor.id },
      });
    }
    await tx.userSetGroup.deleteMany({ where: { userId, setGroupId: { notIn: setGroupIds } } });
    for (const setGroupId of setGroupIds) {
      await tx.userSetGroup.upsert({
        where: { userId_setGroupId: { userId, setGroupId } },
        update: { expiresAt: gExpires[setGroupId] },
        create: { userId, setGroupId, expiresAt: gExpires[setGroupId], grantedById: actor.id },
      });
    }
    await tx.userGroupMember.deleteMany({ where: { userId, groupId: { notIn: groupIds } } });
    for (const groupId of groupIds) {
      await tx.userGroupMember.upsert({ where: { groupId_userId: { groupId, userId } }, update: {}, create: { groupId, userId } });
    }
    if (changes.length) await audit(tx, actor, "Zugriff geändert", changes.join(" · "), userId);
  });
  if (error) return { error };
  refresh();
  return { success: changes.length ? "Gespeichert." : "Keine Änderungen." };
}

export async function signOutUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.users");
  if (!actor) return NO_RIGHTS;
  const userId = String(formData.get("userId") ?? "");
  if (userId === actor.id) return { error: "Dich selbst meldest du über „Abmelden“ ab." };
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  await prisma.adminAuditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: "Abgemeldet", detail: `${count} Sitzung(en) beendet`, targetUserId: userId } });
  refresh();
  return { success: count ? `${count} Sitzung(en) beendet.` : "Es war keine Sitzung aktiv." };
}

export async function setUserDisabled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.users");
  if (!actor) return NO_RIGHTS;
  const userId = String(formData.get("userId") ?? "");
  const disable = formData.get("disable") === "1";
  if (userId === actor.id) return { error: "Du kannst dich nicht selbst sperren." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { disabledAt: disable ? new Date() : null } }),
    ...(disable ? [prisma.session.deleteMany({ where: { userId } })] : []),
    prisma.adminAuditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: disable ? "Gesperrt" : "Entsperrt", targetUserId: userId } }),
  ]);
  refresh();
  return { success: disable ? "Konto gesperrt und abgemeldet." : "Konto entsperrt." };
}

// ---------------------------------------------------------------------------
// Berechtigungssätze
// ---------------------------------------------------------------------------

const nameSchema = z.object({
  name: z.string().trim().min(2, "Der Name braucht mindestens 2 Zeichen.").max(60),
  description: z.string().trim().max(300).default(""),
});

export async function createPermissionSet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id = "";
  const error = await guarded(actor, async (tx) => {
    id = (await tx.permissionSet.create({ data: parsed.data })).id;
    await audit(tx, actor, "Berechtigungssatz angelegt", parsed.data.name);
  });
  if (error) return { error };
  redirect(`/admin/berechtigungen/${id}`);
}

export async function savePermissionSet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const id = String(formData.get("id") ?? "");
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const set = await prisma.permissionSet.findUnique({ where: { id }, include: { permissions: true } });
  if (!set) return { error: "Berechtigungssatz nicht gefunden." };
  // Funktionssatz: enthält immer genau seine eine Berechtigung, Name bleibt
  const locked = isFunctionSetKey(set.key);
  const keys = formData.getAll("perm").map(String).filter(isPermissionKey);
  const before = set.permissions.map((p) => p.permissionKey);
  const label = (k: string) => (isPermissionKey(k) ? PERMISSIONS[k].label : k);
  const changes = [
    set.name !== parsed.data.name ? `Name: ${set.name} → ${parsed.data.name}` : "",
    ...(locked ? [] : listDiff("Recht", before.map(label), keys.map(label))),
  ].filter(Boolean);

  const error = await guarded(actor, async (tx) => {
    await tx.permissionSet.update({ where: { id }, data: { name: locked ? set.name : parsed.data.name, description: parsed.data.description } });
    if (!locked) {
      await tx.permissionSetPermission.deleteMany({ where: { setId: id, permissionKey: { notIn: keys } } });
      await tx.permissionSetPermission.createMany({ data: keys.filter((k) => !before.includes(k)).map((permissionKey) => ({ setId: id, permissionKey })) });
    }
    if (changes.length) await audit(tx, actor, `Berechtigungssatz „${set.name}“ geändert`, changes.join(" · "));
  });
  if (error) return { error };
  refresh();
  return { success: "Gespeichert. Gilt sofort für alle, die diesen Satz haben." };
}

export async function deletePermissionSet(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const id = String(formData.get("id") ?? "");
  const set = await prisma.permissionSet.findUnique({ where: { id } });
  if (!set) return { error: "Berechtigungssatz nicht gefunden." };
  if (set.key) return { error: "Vom System angelegte Sätze lassen sich nicht löschen." };
  const error = await guarded(actor, async (tx) => {
    await tx.permissionSet.delete({ where: { id } });
    await audit(tx, actor, "Berechtigungssatz gelöscht", set.name);
  });
  if (error) return { error };
  refresh();
  redirect("/admin/berechtigungen");
}

// ---------------------------------------------------------------------------
// Abos
// ---------------------------------------------------------------------------

const planSchema = nameSchema.extend({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,30}$/, "Kürzel: 2–30 Zeichen, nur a–z, 0–9 und Bindestrich.")
    .optional(),
  price: z.string().default("0"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export async function savePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const priceCents = parseEuroToCents(parsed.data.price || "0");
  if (priceCents == null || priceCents < 0) return { error: "Ungültiger Preis." };
  const setIds = formData.getAll("set").map(String);
  const makeDefault = formData.get("isDefault") === "on";
  const existing = parsed.data.id
    ? await prisma.plan.findUnique({ where: { id: parsed.data.id }, include: { sets: { include: { set: true } }, setGroups: { include: { setGroup: true } } } })
    : null;
  if (parsed.data.id && !existing) return { error: "Abo nicht gefunden." };
  if (!existing && !parsed.data.key) return { error: "Bitte gib ein Kürzel an." };
  if (existing?.isDefault && !makeDefault) return { error: "Es muss ein Standard-Abo geben. Mach stattdessen ein anderes Abo zum Standard." };
  if (existing?.allAccess) {
    // Abo "Administrator": nur Beschreibung änderbar, Inhalt ist immer "alles"
    await prisma.plan.update({ where: { id: existing.id }, data: { description: parsed.data.description } });
    refresh();
    return { success: "Gespeichert." };
  }
  const [sets, setGroups] = await Promise.all([
    prisma.permissionSet.findMany({ where: { id: { in: setIds } } }),
    prisma.permissionSetGroup.findMany({ where: { id: { in: formData.getAll("setGroup").map(String) } } }),
  ]);

  const error = await guarded(actor, async (tx) => {
    if (makeDefault) await tx.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const data = { name: parsed.data.name, description: parsed.data.description, priceCents, sortOrder: parsed.data.sortOrder, isDefault: makeDefault };
    const plan = existing
      ? await tx.plan.update({ where: { id: existing.id }, data })
      : await tx.plan.create({ data: { ...data, key: parsed.data.key! } });
    await tx.planPermissionSet.deleteMany({ where: { planId: plan.id } });
    await tx.planPermissionSet.createMany({ data: sets.map((s) => ({ planId: plan.id, setId: s.id })) });
    await tx.planSetGroup.deleteMany({ where: { planId: plan.id } });
    await tx.planSetGroup.createMany({ data: setGroups.map((g) => ({ planId: plan.id, setGroupId: g.id })) });
    const changes = existing
      ? [
          ...listDiff("Satzgruppe", existing.setGroups.map((g) => g.setGroup.name), setGroups.map((g) => g.name)),
          ...listDiff("Satz", existing.sets.map((s) => s.set.name), sets.map((s) => s.name)),
        ]
      : [];
    await audit(tx, actor, existing ? `Abo „${existing.name}“ geändert` : "Abo angelegt", existing ? changes.join(" · ") : parsed.data.name);
  });
  if (error) return { error };
  refresh();
  return { success: existing ? "Gespeichert. Gilt sofort für alle mit diesem Abo." : "Abo angelegt." };
}

export async function deletePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const plan = await prisma.plan.findUnique({ where: { id: String(formData.get("id") ?? "") }, include: { _count: { select: { users: true } } } });
  if (!plan) return { error: "Abo nicht gefunden." };
  if (plan.isDefault) return { error: "Das Standard-Abo lässt sich nicht löschen." };
  if (plan.allAccess) return { error: "Das Abo „Administrator“ ist geschützt." };
  const error = await guarded(actor, async (tx) => {
    await tx.plan.delete({ where: { id: plan.id } });
    await audit(tx, actor, "Abo gelöscht", `${plan.name} (${plan._count.users} Nutzer wechseln ins Standard-Abo)`);
  });
  if (error) return { error };
  refresh();
  return { success: "Abo gelöscht." };
}

// ---------------------------------------------------------------------------
// Gruppen
// ---------------------------------------------------------------------------

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id = "";
  const error = await guarded(actor, async (tx) => {
    id = (await tx.userGroup.create({ data: parsed.data })).id;
    await audit(tx, actor, "Personengruppe angelegt", parsed.data.name);
  });
  if (error) return { error };
  redirect(`/admin/gruppen/${id}`);
}

export async function saveGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const id = String(formData.get("id") ?? "");
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const group = await prisma.userGroup.findUnique({ where: { id }, include: { sets: { include: { set: true } }, setGroups: { include: { setGroup: true } } } });
  if (!group) return { error: "Gruppe nicht gefunden." };
  const [sets, setGroups] = await Promise.all([
    prisma.permissionSet.findMany({ where: { id: { in: formData.getAll("set").map(String) } } }),
    prisma.permissionSetGroup.findMany({ where: { id: { in: formData.getAll("setGroup").map(String) } } }),
  ]);
  const error = await guarded(actor, async (tx) => {
    await tx.userGroup.update({ where: { id }, data: parsed.data });
    await tx.groupPermissionSet.deleteMany({ where: { groupId: id } });
    await tx.groupPermissionSet.createMany({ data: sets.map((s) => ({ groupId: id, setId: s.id })) });
    await tx.userGroupSetGroup.deleteMany({ where: { groupId: id } });
    await tx.userGroupSetGroup.createMany({ data: setGroups.map((g) => ({ groupId: id, setGroupId: g.id })) });
    const changes = [
      ...listDiff("Satzgruppe", group.setGroups.map((g) => g.setGroup.name), setGroups.map((g) => g.name)),
      ...listDiff("Satz", group.sets.map((s) => s.set.name), sets.map((s) => s.name)),
    ];
    await audit(tx, actor, `Personengruppe „${group.name}“ geändert`, changes.join(" · "));
  });
  if (error) return { error };
  refresh();
  return { success: "Gespeichert." };
}

export async function addGroupMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.users");
  if (!actor) return NO_RIGHTS;
  const groupId = String(formData.get("groupId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const [group, user] = await Promise.all([prisma.userGroup.findUnique({ where: { id: groupId } }), prisma.user.findUnique({ where: { email } })]);
  if (!group) return { error: "Gruppe nicht gefunden." };
  if (!user) return { error: "Kein Nutzer mit dieser E-Mail." };
  await prisma.$transaction([
    prisma.userGroupMember.upsert({ where: { groupId_userId: { groupId, userId: user.id } }, update: {}, create: { groupId, userId: user.id } }),
    prisma.adminAuditLog.create({ data: { actorId: actor.id, actorName: actor.name, action: `Zu Gruppe „${group.name}“ hinzugefügt`, targetUserId: user.id } }),
  ]);
  refresh();
  return { success: `${user.name} ist jetzt in der Gruppe.` };
}

export async function removeGroupMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.users");
  if (!actor) return NO_RIGHTS;
  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const group = await prisma.userGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Gruppe nicht gefunden." };
  const error = await guarded(actor, async (tx) => {
    await tx.userGroupMember.deleteMany({ where: { groupId, userId } });
    await audit(tx, actor, `Aus Gruppe „${group.name}“ entfernt`, "", userId);
  });
  if (error) return { error };
  refresh();
  return { success: "Entfernt." };
}

export async function deleteGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const group = await prisma.userGroup.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!group) return { error: "Gruppe nicht gefunden." };
  const error = await guarded(actor, async (tx) => {
    await tx.userGroup.delete({ where: { id: group.id } });
    await audit(tx, actor, "Personengruppe gelöscht", group.name);
  });
  if (error) return { error };
  refresh();
  redirect("/admin/gruppen");
}

// ---------------------------------------------------------------------------
// Satzgruppen (Berechtigungssatzgruppen)
// ---------------------------------------------------------------------------

export async function createSetGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id = "";
  const error = await guarded(actor, async (tx) => {
    id = (await tx.permissionSetGroup.create({ data: parsed.data })).id;
    await audit(tx, actor, "Satzgruppe angelegt", parsed.data.name);
  });
  if (error) return { error };
  redirect(`/admin/satzgruppen/${id}`);
}

export async function saveSetGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const id = String(formData.get("id") ?? "");
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const group = await prisma.permissionSetGroup.findUnique({ where: { id }, include: { sets: { include: { set: true } } } });
  if (!group) return { error: "Satzgruppe nicht gefunden." };
  const locked = group.key != null && LOCKED_SET_GROUP_KEYS.includes(group.key);
  const sets = await prisma.permissionSet.findMany({ where: { id: { in: formData.getAll("set").map(String) } } });
  const changes = [
    group.name !== parsed.data.name && !locked ? `Name: ${group.name} → ${parsed.data.name}` : "",
    ...(locked ? [] : listDiff("Satz", group.sets.map((s) => s.set.name), sets.map((s) => s.name))),
  ].filter(Boolean);

  const error = await guarded(actor, async (tx) => {
    await tx.permissionSetGroup.update({ where: { id }, data: { name: locked ? group.name : parsed.data.name, description: parsed.data.description } });
    if (!locked) {
      await tx.setGroupItem.deleteMany({ where: { setGroupId: id } });
      await tx.setGroupItem.createMany({ data: sets.map((s) => ({ setGroupId: id, setId: s.id })) });
    }
    if (changes.length) await audit(tx, actor, `Satzgruppe „${group.name}“ geändert`, changes.join(" · "));
  });
  if (error) return { error };
  refresh();
  return { success: "Gespeichert. Gilt sofort für alle Abos, Personengruppen und Personen mit dieser Satzgruppe." };
}

export async function deleteSetGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await userWithPermission("admin.access_control");
  if (!actor) return NO_RIGHTS;
  const group = await prisma.permissionSetGroup.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!group) return { error: "Satzgruppe nicht gefunden." };
  if (group.key && LOCKED_SET_GROUP_KEYS.includes(group.key)) return { error: "Diese Satzgruppe ist geschützt." };
  const error = await guarded(actor, async (tx) => {
    await tx.permissionSetGroup.delete({ where: { id: group.id } });
    await audit(tx, actor, "Satzgruppe gelöscht", group.name);
  });
  if (error) return { error };
  refresh();
  redirect("/admin/satzgruppen");
}
