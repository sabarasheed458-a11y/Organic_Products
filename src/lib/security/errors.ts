export class PublicError extends Error {}
export function safeErrorMessage(error: unknown, fallback: string) {
  return error instanceof PublicError ? error.message : fallback;
}
export function rpcPayload(data: unknown) {
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error: unknown }).error;
    throw new PublicError(
      typeof message === "string"
        ? message
        : "The request could not be completed.",
    );
  }
  return data;
}
