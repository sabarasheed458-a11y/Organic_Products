"use server";
import { PublicError, safeErrorMessage } from "@/lib/security/errors";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { authSchema } from "@/lib/validation";
import { safePath } from "@/lib/utils";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/types";
import { authErrorMessage, logAuthFailure } from "@/lib/security/auth-errors";
export async function authenticate(
  mode: string,
  input: unknown,
  next = "/account",
): Promise<ActionResult> {
  try {
    z.enum(["login", "register", "forgot", "reset"]).parse(mode);
    const client = await db();
    async function activeSession() {
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user)
        throw new PublicError(
          "Your session could not be verified. Please sign in again.",
        );
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("active")
        .eq("id", user.id)
        .single();
      if (profileError || !profile?.active) {
        await client.auth.signOut();
        throw new PublicError(
          "This account is unavailable. Please contact the store.",
        );
      }
    }
    // Supabase Auth enforces its own persisted endpoint limits. A public shared SQL auth gate can be drained by unrelated callers.
    const base = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    if (mode === "forgot") {
      const { email } = authSchema.pick({ email: true }).parse(input);
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: base + "/auth/callback?next=/reset-password",
      });
      if (error) {
        logAuthFailure(mode, error);
        throw new PublicError(
          "Password recovery is temporarily unavailable. Please try again later.",
        );
      }
      return {
        ok: true,
        message: "If an account exists, a reset link has been sent.",
      };
    }
    if (mode === "reset") {
      const { password } = z
        .object({ password: z.string().min(10).max(128) })
        .parse(input);
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user)
        throw new PublicError(
          "Open the password reset link from your email first.",
        );
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw new PublicError(
          "Password could not be updated. Request a new reset link.",
        );
      return { ok: true, message: "Password updated. You can now sign in." };
    }
    const p = authSchema.parse(input);
    if (mode === "register") {
      if (!p.full_name || p.full_name.length < 2)
        throw new PublicError("Enter your full name.");
      const callback = new URL(base + "/auth/callback");
      callback.searchParams.set("next", safePath(next));
      const { data, error } = await client.auth.signUp({
        email: p.email,
        password: p.password,
        options: {
          data: { full_name: p.full_name },
          emailRedirectTo: callback.toString(),
        },
      });
      if (error) {
        logAuthFailure(mode, error);
        throw new PublicError(authErrorMessage(error));
      }
      if (!data.user)
        throw new PublicError(
          "Registration could not be completed. Please try again later.",
        );
      if (data.session) {
        await activeSession();
        return {
          ok: true,
          message: "Signed in.",
          data: { authenticated: true },
        };
      }
      return {
        ok: true,
        message:
          "Check your email to confirm your account. Open the link in this browser to continue.",
        data: { authenticated: false },
      };
    }
    if (mode !== "login") throw new PublicError("Invalid request");
    const { error } = await client.auth.signInWithPassword({
      email: p.email,
      password: p.password,
    });
    if (error) {
      logAuthFailure(mode, error);
      throw new PublicError(authErrorMessage(error));
    }
    await activeSession();
    return { ok: true, message: "Signed in.", data: { authenticated: true } };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof z.ZodError
          ? e.issues[0].message
          : safeErrorMessage(e, "Authentication failed. Please try again."),
    };
  }
}
export async function signOut() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const client = await db();
    const { error } = await client.auth.signOut();
    if (error) {
      logAuthFailure("logout", error);
      throw new PublicError(
        "Sign out could not be completed. Please try again.",
      );
    }
  }
  redirect("/");
}
export async function authDestination(next: string) {
  return safePath(next);
}
