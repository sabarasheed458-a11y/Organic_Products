"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitFeedback, moderateFeedback } from "@/actions/commerce";
import { actionRequest } from "@/lib/action-request";
import type { Feedback } from "@/types";
export function FeedbackForm({
  orderId,
  productId,
  name,
  feedback,
}: {
  orderId: string;
  productId: string;
  name: string;
  feedback?: Feedback;
}) {
  const router = useRouter(),
    pending = useRef(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="feedback-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        const f = new FormData(e.currentTarget);
        const r = await actionRequest(() =>
          submitFeedback({
            order_id: orderId,
            product_id: productId,
            rating: Number(f.get("rating")),
            content: f.get("content"),
          }),
        );
        pending.current = false;
        setBusy(false);
        setMessage(
          r.ok
            ? "Thank you. Your feedback is awaiting admin review."
            : r.message,
        );
        if (r.ok) router.refresh();
      }}
    >
      <h3>{name}</h3>
      <p>
        {feedback
          ? feedback.approved
            ? "Your feedback is published. Editing it sends it back for review."
            : "Your feedback is awaiting admin review."
          : "Share your experience with this delivered product."}
      </p>
      <fieldset disabled={busy}>
        <label>
          Rating
          <select name="rating" required defaultValue={feedback?.rating ?? ""}>
            <option value="" disabled>
              Choose a rating
            </option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>
        <label>
          Your feedback
          <textarea
            name="content"
            required
            minLength={3}
            maxLength={3000}
            defaultValue={feedback?.content ?? ""}
            rows={3}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {feedback ? "Update feedback" : "Send feedback"}
        </button>
      </fieldset>
      {feedback?.admin_reply && (
        <blockquote>
          <strong>Store reply</strong>
          <p>{feedback.admin_reply}</p>
        </blockquote>
      )}
      <p role="status">{message}</p>
    </form>
  );
}
export function FeedbackModeration({ feedback }: { feedback: Feedback }) {
  const router = useRouter(),
    pending = useRef(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <article className="panel">
      <h2>{feedback.product_name ?? "Product feedback"}</h2>
      <p>
        {feedback.rating} / 5 ·{" "}
        {feedback.approved ? "Published" : "Pending / hidden"}
      </p>
      <p className="whitespace">{feedback.content}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const r = await actionRequest(() =>
            moderateFeedback({
              id: feedback.id,
              approved: f.get("approved") === "on",
              reply: f.get("reply"),
            }),
          );
          pending.current = false;
          setBusy(false);
          setMessage(r.ok ? "Feedback moderation saved." : r.message);
          if (r.ok) router.refresh();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            <input
              type="checkbox"
              name="approved"
              defaultChecked={feedback.approved}
            />{" "}
            Publish on product page
          </label>
          <label>
            Reply to customer
            <textarea
              name="reply"
              maxLength={2000}
              rows={3}
              defaultValue={feedback.admin_reply}
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            Save feedback review
          </button>
        </fieldset>
        <p role="status">{message}</p>
      </form>
    </article>
  );
}
