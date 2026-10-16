export function authErrorMessage(error: { code?: string; status?: number }) {
  if (error.code === "over_email_send_rate_limit")
    return "The confirmation-email sending limit has been reached. Check your inbox for an existing link or try again later.";
  if (error.code === "invalid_credentials")
    return "Email or password is incorrect.";
  if (error.code === "email_not_confirmed")
    return "Confirm your email before signing in. Open the confirmation link in the same browser you used to register.";
  if (
    error.code === "email_provider_disabled" ||
    error.code === "signup_disabled"
  )
    return "Email sign-in or registration is currently unavailable. Please contact the store.";
  if (
    error.status === 429 ||
    ["over_request_rate_limit", "over_email_send_rate_limit"].includes(
      error.code ?? "",
    )
  )
    return "Too many attempts. Please wait and try again.";
  if (error.code === "user_already_exists" || error.code === "email_exists")
    return "Registration could not be completed. Try signing in or recovering your password.";
  return "Authentication is temporarily unavailable. Please try again later.";
}

export function logAuthFailure(
  operation: string,
  error: { code?: string; status?: number },
) {
  const known = [
    "invalid_credentials",
    "email_not_confirmed",
    "email_provider_disabled",
    "signup_disabled",
    "over_request_rate_limit",
    "over_email_send_rate_limit",
    "user_already_exists",
    "email_exists",
    "unexpected_failure",
  ];
  console.warn("Auth request rejected", {
    operation,
    code: known.includes(error.code ?? "") ? error.code : "auth_error",
    status: typeof error.status === "number" ? error.status : undefined,
  });
}
