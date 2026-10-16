export default function Loading() {
  return (
    <div className="section" aria-busy="true" aria-label="Loading page">
      <div className="skeleton" />
      <div className="product-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    </div>
  );
}
