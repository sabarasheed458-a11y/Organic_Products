"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRecord, updateStaff } from "@/actions/commerce";
import { utcSchedule } from "@/lib/admin-input";
import { actionRequest } from "@/lib/action-request";
import { ImageField } from "./image-field";
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "textarea"
    | "checkbox"
    | "select"
    | "datetime-local"
    | "json";
  imageTarget?: "categories" | "banners" | "branding";
  options?: { value: string; label: string }[];
  nullable?: boolean;
  default?: unknown;
};
export function RecordEditor({
  table,
  record,
  fields,
  title,
}: {
  table: string;
  record?: Record<string, unknown>;
  fields: Field[];
  title: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  return (
    <details className="record-editor" open={!record}>
      <summary>{title}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (uploading || busy) return;
          setBusy(true);
          setMessage("");
          const form = new FormData(e.currentTarget),
            values: Record<string, unknown> = {};
          try {
            for (const f of fields) {
              const raw = form.get(f.key);
              values[f.key] =
                f.type === "checkbox"
                  ? raw === "on"
                  : f.nullable && raw === ""
                    ? null
                    : f.type === "number"
                      ? Number(raw)
                      : f.type === "json"
                        ? JSON.parse(String(raw))
                        : f.type === "datetime-local"
                          ? utcSchedule(String(raw))
                          : raw;
            }
            const r =
              table === "staff"
                ? await actionRequest(() =>
                    updateStaff({ id: record!.id, ...values }),
                  )
                : await actionRequest(() =>
                    saveRecord(table, (record?.id as string) ?? null, values),
                  );
            setMessage(r.message);
            if (r.ok) router.refresh();
          } catch {
            setMessage("Check the JSON and date fields.");
          }
          setBusy(false);
        }}
      >
        <div className="form-grid">
          {fields.map((f) => {
            const value = record?.[f.key] ?? f.default ?? "";
            if (f.imageTarget)
              return (
                <ImageField
                  key={f.key + String(record?.id ?? "new")}
                  name={f.key}
                  label={f.label}
                  initialValue={String(value)}
                  target={f.imageTarget}
                  onBusy={setUploading}
                />
              );
            return (
              <label
                key={f.key}
                className={
                  f.type === "textarea" || f.type === "json" ? "span-2" : ""
                }
              >
                {f.label}
                {f.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    name={f.key}
                    defaultChecked={Boolean(value)}
                  />
                ) : f.type === "select" ? (
                  <select name={f.key} defaultValue={String(value)}>
                    {f.nullable && <option value="">None</option>}
                    {f.options?.map((o) => (
                      <option value={o.value} key={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" || f.type === "json" ? (
                  <textarea
                    name={f.key}
                    defaultValue={
                      f.type === "json"
                        ? JSON.stringify(value || [], null, 2)
                        : String(value)
                    }
                    rows={f.type === "json" ? 3 : 5}
                  />
                ) : (
                  <input
                    name={f.key}
                    type={f.type ?? "text"}
                    defaultValue={
                      f.type === "datetime-local" && value
                        ? String(value).slice(0, 16)
                        : String(value)
                    }
                    step={f.type === "number" ? "1" : undefined}
                  />
                )}
              </label>
            );
          })}
        </div>
        <button className="btn btn-primary" disabled={busy || uploading}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
