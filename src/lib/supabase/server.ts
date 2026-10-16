import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isPublicSupabaseKey } from "@/lib/security/config";
import { PublicError } from "@/lib/security/errors";
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_PROJECT"),
  );
export async function db() {
  if (!configured())
    throw new PublicError(
      "Connect Supabase to enable this feature. See the setup guide.",
    );
  const jar = await cookies();
  if (!isPublicSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!))
    throw new PublicError(
      "Configure a Supabase publishable or legacy anon key. Secret keys are not permitted.",
    );
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server Components refresh through proxy. */
          }
        },
      },
    },
  );
}
