import "server-only";
import { one, q } from "./db";
import { notify, emailLayout } from "./notify";
import { portalUrl } from "./reminders";

/**
 * Server errors are written to error_log, and the Managing Partner gets one
 * email an hour at most while errors are happening, so problems are known
 * before staff have to report them. No request bodies or personal data are
 * recorded: only the page, the error message and its reference.
 */
export async function recordError(message: string, path: string | null, digest: string | null) {
  await q("INSERT INTO error_log (path, message, digest) VALUES ($1,$2,$3)", [path?.slice(0, 300) ?? null, message.slice(0, 1000), digest]);
  await q("DELETE FROM error_log WHERE at < now() - interval '90 days'");
  const hour = new Date().toISOString().slice(0, 13);
  const admins = await q<{ id: string; email: string; full_name: string; phone: string | null }>("SELECT id, email, full_name, phone FROM users WHERE active AND role = 'admin'");
  const count = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM error_log WHERE at > now() - interval '1 hour'");
  const href = `${portalUrl()}/admin/system`;
  for (const a of admins) {
    await notify({ ...a, notify_email: true }, {
      kind: "error_alert", key: `errors:${hour}`, subject: "Portal error alert",
      html: emailLayout("The portal hit an error", [{ heading: "Latest", items: [{ title: message.slice(0, 160), detail: `${path || ""}${digest ? ` · ref ${digest}` : ""}` }] }], `${count?.n ?? 1} error(s) in the last hour. Details are on the System page. You get at most one of these emails an hour.`, href),
      text: `The portal hit an error: ${message.slice(0, 160)} (${path || ""}). ${href}`,
    });
  }
}
