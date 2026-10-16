"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveAddress,
  deleteAddress,
  saveProfile,
  sendInquiry,
} from "@/actions/commerce";
import type { Address, ActionResult } from "@/types";
import { actionRequest } from "@/lib/action-request";
function useSubmit() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function run(task: () => Promise<ActionResult>) {
    setBusy(true);
    const r = await actionRequest(task);
    setBusy(false);
    setMessage(r.message);
    if (r.ok) router.refresh();
  }
  return { busy, message, run };
}
export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const { busy, message, run } = useSubmit();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() =>
          saveProfile({ full_name: f.get("full_name"), phone: f.get("phone") }),
        );
      }}
    >
      <h2>Your details</h2>
      <label>
        Full name
        <input
          name="full_name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <label>
        Phone
        <input name="phone" defaultValue={phone} maxLength={25} />
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function AddressForm({ address }: { address?: Address }) {
  const { busy, message, run } = useSubmit();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => saveAddress(address?.id ?? null, Object.fromEntries(f)));
      }}
    >
      <h3>{address ? "Edit address" : "Add a new address"}</h3>
      <div className="form-grid">
        {(["full_name", "phone", "line1", "city", "postal_code"] as const).map(
          (k) => (
            <label key={k}>
              {k.replaceAll("_", " ")}
              <input
                name={k}
                defaultValue={address?.[k] ?? ""}
                required={k !== "postal_code"}
                maxLength={k === "line1" ? 300 : 120}
              />
            </label>
          ),
        )}
      </div>
      <div className="button-row">
        <button className="btn btn-primary" disabled={busy}>
          Save address
        </button>
        {address?.id && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={() =>
              confirm("Delete this address?") &&
              run(() => deleteAddress(address.id!))
            }
          >
            Delete
          </button>
        )}
      </div>
      <p role="status">{message}</p>
    </form>
  );
}
export function ContactForm() {
  const { busy, message, run } = useSubmit();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => sendInquiry(Object.fromEntries(f)));
      }}
    >
      <h2>Send us a note</h2>
      <label>
        Your name
        <input name="name" required minLength={2} maxLength={120} />
      </label>
      <label>
        Email address
        <input type="email" name="email" required maxLength={254} />
      </label>
      <label>
        How can we help?
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={3000}
          rows={5}
        />
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Send message"}
      </button>
      <p role="status">
        {message === "Saved successfully."
          ? "Your message has been received. Thank you."
          : message}
      </p>
    </form>
  );
}
