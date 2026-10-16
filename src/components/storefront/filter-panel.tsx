"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function FilterPanel({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.matchMedia("(max-width:760px)").matches)
      panel.current?.removeAttribute("open");
  }, []);
  return (
    <details ref={panel} className="catalog-filter-panel" open>
      <summary>
        Filter & sort <span>{count} products</span>
      </summary>
      {children}
    </details>
  );
}
