"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="section empty">
      <h1>Something didn’t load.</h1>
      <p>Please try again. If the problem continues, contact the store.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
