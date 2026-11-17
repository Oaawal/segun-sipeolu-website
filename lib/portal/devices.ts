import "server-only";
import { one, q } from "./db";
import { sha256 } from "./crypto";
import { requestMeta } from "./auth";
import { notify, emailLayout } from "./notify";
import { portalUrl } from "./reminders";

/** "Chrome on Windows", "Safari on iPhone": coarse on purpose, so updates don't count as new devices. */
export function deviceLabel(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Microsoft Office|Word/.test(ua) ? "Word" : "a browser";
  return `${br} on ${os}`;
}

/**
 * After a successful sign-in: if this person has signed in before but never
 * from this kind of device, email them, so a stolen password shows up fast.
 */
export async function checkNewDevice(u: { id: string; email: string; full_name: string }) {
  try {
    const { ip, userAgent } = await requestMeta();
    const label = deviceLabel(userAgent || "");
    const hash = sha256(`${u.id}|${label}`);
    const known = await one("SELECT 1 FROM known_devices WHERE user_id = $1 AND device_hash = $2", [u.id, hash]);
    if (known) {
      await q("UPDATE known_devices SET last_seen = now() WHERE user_id = $1 AND device_hash = $2", [u.id, hash]);
      return;
    }
    const first = !(await one("SELECT 1 FROM known_devices WHERE user_id = $1", [u.id]));
    await q("INSERT INTO known_devices (user_id, device_hash, label) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [u.id, hash, label]);
    if (first) return;
    const when = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
    const href = `${portalUrl()}/account`;
    const r = await one<{ phone: string | null; notify_email: boolean }>("SELECT phone, notify_email FROM users WHERE id = $1", [u.id]);
    // Always by email, even if reminders are switched off: this is a security notice
    await notify({ id: u.id, email: u.email, full_name: u.full_name, phone: r?.phone ?? null, notify_email: true }, {
      kind: "new_device", key: `device:${hash}`, subject: "New sign-in to your portal account",
      html: emailLayout("New sign-in to your account", [{ heading: "Sign-in", items: [{ title: label, detail: `${when} (Lagos time)${ip ? ` · network address ${ip}` : ""}` }] }], "If this was you, there is nothing to do. If not, change your password now and tell the Managing Partner: they can sign you out everywhere.", href),
      text: `New sign-in to your portal account: ${label}, ${when}${ip ? `, ${ip}` : ""}. If this was not you, change your password and tell the Managing Partner.`,
    });
  } catch {
    /* never block a sign-in on the alert */
  }
}
