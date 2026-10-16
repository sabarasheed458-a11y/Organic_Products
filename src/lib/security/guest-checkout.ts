import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
export const guestCookie = "mira-guest-order-access";
export async function guestToken(create = false) {
  const jar = await cookies();
  const saved = jar.get(guestCookie)?.value;
  if (saved && /^[0-9a-f]{64}$/.test(saved)) return saved;
  if (!create) return null;
  const value = randomBytes(32).toString("hex");
  jar.set(guestCookie, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return value;
}
