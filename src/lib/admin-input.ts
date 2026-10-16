// The editor explicitly labels schedules as UTC; datetime-local has no timezone.
export function utcSchedule(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new Error("Invalid UTC schedule");
  const iso = new Date(value + "Z").toISOString();
  if (iso.slice(0, 16) !== value.slice(0, 16))
    throw new Error("Invalid UTC schedule");
  return iso;
}

export function codReconciliation(status: string, payment: string) {
  if (["delivered", "returned"].includes(status) && payment === "unpaid")
    return "paid";
  if (status === "returned" && payment === "paid") return "refunded";
  return null;
}
