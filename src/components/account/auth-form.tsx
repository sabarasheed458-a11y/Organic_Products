"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authenticate } from "@/actions/auth";
import { safePath } from "@/lib/utils";
import { actionRequest } from "@/lib/action-request";
import { brandName } from "@/lib/branding";
export function AuthForm({
  mode,
  next = "/account",
  error,
}: {
  mode: string;
  next?: string;
  error?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      error === "confirmation"
        ? "The confirmation link could not be verified. Open it in the browser used to register, or request a new link."
        : "",
    );
  const destination = safePath(next);
  const returnQuery = "?next=" + encodeURIComponent(destination);
  const router = useRouter();
  const title =
    {
      login: "Welcome back.",
      register: "Make yourself at home.",
      forgot: "A fresh start.",
      reset: "Choose a new password.",
    }[mode] ?? "Sign in";
  return (
    <div className="auth-shell">
      <p className="eyebrow">{brandName}</p>
      <h1>{title}</h1>
      <p className="muted">
        {mode === "login"
          ? "Sign in for your saved products, orders, and a smoother checkout."
          : mode === "register"
            ? "A little space for all your favourites."
            : mode === "forgot"
              ? "We’ll email a secure link to reset your password."
              : "Use at least 10 characters."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const r = await actionRequest(() =>
            authenticate(mode, Object.fromEntries(f), destination),
          );
          setBusy(false);
          setMessage(r.message);
          if (r.ok && r.data?.authenticated === true) {
            router.push(destination);
            router.refresh();
          }
        }}
      >
        {mode === "register" && (
          <label>
            Full name
            <input
              name="full_name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={10}
              maxLength={128}
              required
            />
          </label>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy
            ? "Please wait…"
            : {
                login: "Sign in",
                register: "Create account",
                forgot: "Send reset link",
                reset: "Update password",
              }[mode]}
        </button>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
      </form>
      <div className="auth-links">
        {mode === "login" ? (
          <>
            <Link href="/forgot-password">Forgot your password?</Link>
            <Link href={"/register" + returnQuery}>Create an account →</Link>
          </>
        ) : (
          <Link href={"/login" + returnQuery}>Back to sign in →</Link>
        )}
      </div>
    </div>
  );
}
