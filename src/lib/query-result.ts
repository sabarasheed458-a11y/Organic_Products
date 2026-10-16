export function queryRows<T>(
  result: { data: T[] | null; error: unknown },
  message: string,
) {
  if (result.error) throw new Error(message);
  return result.data ?? [];
}
