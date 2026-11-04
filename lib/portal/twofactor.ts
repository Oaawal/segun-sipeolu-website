import "server-only";
import QRCode from "qrcode";
import { one, q } from "./db";
import { decrypt, encrypt, newTotpSecret, totpUri } from "./crypto";
import { FIRM } from "./vocab";

/**
 * The secret being set up for an authenticator app. It is kept (encrypted)
 * until the first code confirms it, so refreshing the page shows the same QR.
 */
export async function pendingTwoFactor(userId: string, email: string) {
  const row = await one<{ totp_secret: string | null; totp_enabled: boolean }>("SELECT totp_secret, totp_enabled FROM users WHERE id = $1", [userId]);
  if (!row || row.totp_enabled) return null;
  let secret = row.totp_secret ? decrypt(row.totp_secret) : null;
  if (!secret) {
    secret = newTotpSecret();
    await q("UPDATE users SET totp_secret = $2 WHERE id = $1 AND NOT totp_enabled", [userId, encrypt(secret)]);
  }
  const uri = totpUri(secret, email, `${FIRM.name} Portal`);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, color: { dark: "#2B0D17", light: "#FFFFFF" } });
  return { secret, svg };
}
