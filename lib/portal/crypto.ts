import "server-only";
import crypto from "node:crypto";

/**
 * Secrets and hashing for the portal.
 *  - Passwords: scrypt (N=2^15) with a per-password salt.
 *  - Tokens (sessions, invites): only SHA-256 hashes are stored.
 *  - Two-factor secrets: AES-256-GCM, key derived from APP_SECRET.
 *  - TOTP (RFC 6238) for authenticator apps.
 */

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set (at least 32 characters) before the portal can run in production.");
  }
  return "development-only-secret-do-not-use-in-production!!";
}

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 32, SCRYPT, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${SCRYPT.N}$${salt.toString("base64")}$${key.toString("base64")}`),
    ),
  );
}

export function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    // Always do the work, so timing does not reveal whether the account exists
    const [, n, saltB64, keyB64] = (stored || "scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=").split("$");
    const expected = Buffer.from(keyB64 || "", "base64");
    crypto.scrypt(password, Buffer.from(saltB64 || "", "base64"), 32, { ...SCRYPT, N: Number(n) || SCRYPT.N }, (err, key) => {
      if (err || expected.length !== key.length) return resolve(false);
      resolve(crypto.timingSafeEqual(expected, key) && !!stored);
    });
  });
}

/** Password rules: long passphrases beat complexity rules (NIST SP 800-63B). */
export function passwordProblem(pw: string, email = "", name = ""): string | null {
  if (pw.length < 12) return "Use at least 12 characters. A short sentence works well.";
  if (pw.length > 200) return "That password is too long.";
  const lower = pw.toLowerCase();
  if (email && lower.includes(email.split("@")[0].toLowerCase())) return "Do not use your email address in the password.";
  if (name && name.split(/\s+/).some((w) => w.length > 3 && lower.includes(w.toLowerCase()))) return "Do not use your name in the password.";
  if (/^(.)\1+$/.test(pw) || ["password1234", "123456789012", "qwertyuiopas"].includes(lower)) return "That password is too easy to guess.";
  return null;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function key(purpose: string): Buffer {
  return crypto.createHash("sha256").update(`${purpose}:${appSecret()}`).digest();
}

export function encrypt(plain: string, purpose = "totp"): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function decrypt(blob: string, purpose = "totp"): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

// ── TOTP (authenticator apps) ───────────────────────────────────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

/** Accepts the current 30-second code and one step either side, for clock drift. */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return false;
  const step = Math.floor(now / 30000);
  return [-1, 0, 1].some((d) => {
    const a = Buffer.from(hotp(secret, step + d));
    return crypto.timingSafeEqual(a, Buffer.from(c));
  });
}

export function totpCode(secret: string, now = Date.now()) {
  return hotp(secret, Math.floor(now / 30000));
}

export function totpUri(secret: string, email: string, issuer: string) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
