"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { invitableRoles, type Role } from "@/lib/portal/permissions";
import { CODE_DAYS, codeHash, newCode, normaliseCode } from "@/lib/portal/accounts";
import { str } from "@/lib/portal/format";

export async function createCode(fd: FormData) {
  const u = await requireUser();
  const allowed = invitableRoles(u);
  const role = String(fd.get("role") || "") as Role;
  if (!allowed.includes(role)) redirect("/portal/invitations?msg=denied");
  const code = newCode();
  const n = normaliseCode(code)!;
  await tx(async (t) => {
    await t.query(`INSERT INTO invite_codes (code_hash, hint, role, note, created_by, expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '${CODE_DAYS} days')`,
      [codeHash(n), n.slice(-4), role, str(fd, "note", 160), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "invite_code.created", entityType: "invite_code", entityId: n.slice(-4), detail: { role, for: str(fd, "note", 160) } }, t);
  });
  // Shown once on the next page, never put in a URL or stored
  (await cookies()).set("ssa_new_code", code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/portal/invitations", maxAge: 300 });
  redirect("/portal/invitations?new=1");
}

export async function revokeCode(fd: FormData) {
  const u = await requireUser();
  const hash = String(fd.get("code") || "");
  if (!/^[0-9a-f]{64}$/.test(hash)) redirect("/portal/invitations");
  // People can withdraw their own unused codes; the Managing Partner can withdraw any
  await tx(async (t) => {
    const r = await t.query<{ hint: string }>(
      `UPDATE invite_codes SET revoked_at = now() WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL ${u.role === "admin" ? "" : "AND created_by = $2"} RETURNING hint`,
      u.role === "admin" ? [hash] : [hash, u.id]);
    if (r.rows.length) await audit({ userId: u.id, actor: u.email, action: "invite_code.revoked", entityType: "invite_code", entityId: r.rows[0].hint }, t);
  });
  redirect("/portal/invitations?msg=saved");
}
