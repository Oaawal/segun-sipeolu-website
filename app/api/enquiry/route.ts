import { NextResponse, type NextRequest } from "next/server";
import { one, tx, nextNumber } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { announceEnquiry } from "@/lib/portal/enquiries";
import { services } from "@/lib/site-data";

export const runtime = "nodejs";

/**
 * The website's contact form. Each message becomes an enquiry in the portal
 * and the team is told. Spam protection: a hidden field robots fill in, a
 * minimum of sense in the fields, and at most 5 messages an hour per address.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const get = (k: string, max: number) => String(fd.get(k) || "").trim().slice(0, max);
  if (get("website", 200)) return NextResponse.json({ ok: true }); // a robot: pretend all is well
  const name = get("name", 120);
  const email = get("email", 254).toLowerCase();
  const summary = get("summary", 5000);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || summary.length < 10) return NextResponse.json({ error: "Please give your name, a valid email and a short description." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const recent = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM enquiries WHERE ip IS NOT DISTINCT FROM $1 AND created_at > now() - interval '1 hour'", [ip]);
  if (Number(recent?.n) >= 5) return NextResponse.json({ error: "We have received several messages from you. We will be in touch shortly." }, { status: 429 });
  const area = services.find((s) => s.slug === get("practice_area", 100))?.title ?? null;
  const id = crypto.randomUUID();
  const number = await tx(async (t) => {
    const n = await nextNumber(t, "ENQ");
    await t.query("INSERT INTO enquiries (id, number, name, email, phone, practice_area, summary, source, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,'website',$8)",
      [id, n, name, email, get("phone", 40) || null, area, summary, ip]);
    await audit({ actor: `website:${email}`, action: "enquiry.received", entityType: "enquiry", entityId: id, ip }, t);
    return n;
  });
  await announceEnquiry({ id, number, name, practice_area: area, source: "website" }).catch(() => {});
  return NextResponse.json({ ok: true });
}
