import Link from "next/link";
import { pageWindow } from "@/lib/storefront";
import { catalog, categories } from "@/repositories/catalog";
import { ProductCard } from "./product-card";
import { FilterPanel } from "./filter-panel";
import { brandName } from "@/lib/branding";
export async function CatalogView({
  category = "",
  params,
}: {
  category?: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const scalar = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const q = scalar("q").slice(0, 100);
  const activeCategory =
    scalar("category") || (category === "all" ? "" : category);
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(scalar("page")) || 1)),
  );
  const sort = scalar("sort") || "newest";
  const min = Math.max(0, Number(scalar("min")) || 0) * 100,
    max = scalar("max")
      ? Math.max(
          min,
          Math.min(100000000, (Number(scalar("max")) || 1000000) * 100),
        )
      : 100000000;
  const [{ products, count }, cats] = await Promise.all([
    catalog({
      q,
      category: activeCategory,
      page,
      sort,
      min,
      max,
    }),
    categories(),
  ]);
  const title = q
    ? `Results for “${q}”`
    : (cats.find((c) => c.slug === activeCategory)?.name ?? "The collection");
  const pages = Math.ceil(count / 12);
  return (
    <div className="section">
      <div className="catalog-heading">
        <p className="eyebrow">{brandName}</p>
        <h1>{title}</h1>
        <p className="muted">
          Explore our products. {count} items available.
        </p>
      </div>
      <FilterPanel count={count}>
        <form className="filters catalog-filters" action="/collections/all">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search products"
            aria-label="Search products"
          />
          <select
            name="category"
            defaultValue={
              scalar("category") || (category === "all" ? "" : category)
            }
            aria-label="Collection"
          >
            <option value="">All collections</option>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            name="min"
            defaultValue={scalar("min")}
            placeholder="Min PKR"
            aria-label="Minimum price"
          />
          <input
            type="number"
            min="0"
            name="max"
            defaultValue={scalar("max")}
            placeholder="Max PKR"
            aria-label="Maximum price"
          />
          <select name="sort" defaultValue={sort} aria-label="Sort products">
            <option value="newest">Newest first</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name</option>
          </select>
          <button className="btn btn-primary">Apply</button>
          <Link className="text-link" href="/collections/all">
            Clear filters
          </Link>
        </form>
      </FilterPanel>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No products found</h2>
          <p>Try a different search or check back for the next collection.</p>
          <Link href="/collections/all">Explore all products →</Link>
        </div>
      )}
      {pages > 1 && (
        <nav className="pagination" aria-label="Catalog pages">
          {page > 1 && (
            <Link href={pageLink(page - 1, params)} aria-label="Previous page">
              Previous
            </Link>
          )}
          {pageWindow(page, pages).map((p, i, list) => (
            <span className="pagination-item" key={p}>
              {i > 0 && p - list[i - 1] > 1 && (
                <span aria-hidden="true">...</span>
              )}
              <Link
                href={pageLink(p, params)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </Link>
            </span>
          ))}
          {page < pages && (
            <Link href={pageLink(page + 1, params)} aria-label="Next page">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function pageLink(
  page: number,
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string") query.set(key, value);
  query.set("page", String(page));
  return "?" + query;
}
