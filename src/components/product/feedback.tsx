import type { Feedback } from "@/types";
export function ProductFeedback({ feedback }: { feedback: Feedback[] }) {
  return (
    <section className="panel" aria-label="Customer reviews">
      <h2>Customer feedback</h2>
      {feedback.length ? (
        feedback.map((r) => (
          <article className="feedback-form" key={r.id}>
            <p>
              <strong>{r.rating} / 5</strong> ·{" "}
              {new Date(r.created_at).toLocaleDateString("en-PK", {
                timeZone: "Asia/Karachi",
              })}
            </p>
            <p className="whitespace">{r.content}</p>
            {r.admin_reply && (
              <blockquote>
                <strong>Store reply</strong>
                <p>{r.admin_reply}</p>
              </blockquote>
            )}
          </article>
        ))
      ) : (
        <p>
          No published feedback yet. Customers can share their experience from
          their delivered order.
        </p>
      )}
    </section>
  );
}
