import { z } from "zod";
const attempt = z.object({ fingerprint: z.string(), key: z.uuid() });
export function checkoutAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  fingerprint: string,
) {
  let saved: z.infer<typeof attempt> | null = null;
  try {
    const value = attempt.safeParse(
      JSON.parse(storage.getItem("mira-checkout") ?? "null"),
    );
    if (value.success) saved = value.data;
  } catch {
    // A corrupt previous entry can be replaced; the write below must succeed.
  }
  const key =
    saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
  storage.setItem("mira-checkout", JSON.stringify({ fingerprint, key }));
  return key;
}
