import Link from "next/link";
export default function NotFound() {
  return (
    <div className="section empty">
      <p className="eyebrow">404</p>
      <h1>This page has wandered off.</h1>
      <Link className="btn btn-primary" href="/collections/all">
        Back to the collection
      </Link>
    </div>
  );
}
