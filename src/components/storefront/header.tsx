"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  Search,
  UserRound,
  Heart,
  ShoppingBag,
  Menu,
  X,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { useShopping } from "./shopping-provider";
import type { Category, Settings } from "@/types";
import { brandName, brandSlogan } from "@/lib/branding";
export function Header({
  settings,
  categories,
}: {
  settings: Settings;
  categories: Category[];
}) {
  const { cart, wishlist } = useShopping();
  const pathname = usePathname();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null),
    searchButton = useRef<HTMLButtonElement>(null);
  const announcement =
    settings.announcement === "Thoughtfully made. Beautifully worn."
      ? brandSlogan
      : settings.announcement;
  const links = settings.navigation.length
    ? settings.navigation
    : [
        { label: "Shop all", href: "/collections/all" },
        { label: "Our story", href: "/pages/about-us" },
      ];
  function closeMenu() {
    setOpen(false);
    menuButton.current?.focus();
  }
  return (
    <>
      <div className="announcement">
        <span>{announcement}</span>
        <Link href="/collections/all">
          Shop products <ArrowUpRight size={14} />
        </Link>
      </div>
      <header
        className="header"
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) closeMenu();
        }}
      >
        <button
          ref={menuButton}
          className="icon mobile-only"
          onClick={() => {
            setOpen(!open);
            setSearch(false);
          }}
          aria-expanded={open}
          aria-controls="store-navigation"
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
        <Link href="/" className="wordmark">
          {settings.logo_url ? (
            <Image
              src={settings.logo_url}
              alt={brandName}
              width={150}
              height={45}
            />
          ) : (
            <span className="brand-name">{brandName}</span>
          )}
          <span className="brand-slogan">{brandSlogan}</span>
        </Link>
        <nav
          id="store-navigation"
          className={open ? "nav is-open" : "nav"}
          aria-label="Main navigation"
          onKeyDown={(e) => {
            if (e.key === "Escape") closeMenu();
          }}
        >
          {links.slice(0, 2).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          {links.length > 2 && (
            <details
              className="collection-menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.currentTarget.open = false;
                  e.currentTarget.querySelector("summary")?.focus();
                  e.stopPropagation();
                }
              }}
            >
              <summary>
                More <ChevronDown size={14} />
              </summary>
              <div className="collection-dropdown">
                {links.slice(2).map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={pathname === l.href ? "page" : undefined}
                    onClick={(e) => {
                      setOpen(false);
                      const details = e.currentTarget.closest("details");
                      if (details) details.open = false;
                    }}
                  >
                    {l.label}
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              </div>
            </details>
          )}
          {categories.length > 0 && (
            <details
              className="collection-menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.currentTarget.open = false;
                  e.currentTarget.querySelector("summary")?.focus();
                  e.stopPropagation();
                }
              }}
            >
              <summary>
                Collections <ChevronDown size={14} />
              </summary>
              <div className="collection-dropdown">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    href={"/collections/" + c.slug}
                    aria-current={
                      pathname === "/collections/" + c.slug ? "page" : undefined
                    }
                    onClick={(e) => {
                      setOpen(false);
                      const details = e.currentTarget.closest("details");
                      if (details) details.open = false;
                    }}
                  >
                    {c.name}
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              </div>
            </details>
          )}
          <div className="mobile-menu-account">
            <Link href="/account" onClick={() => setOpen(false)}>
              <UserRound size={18} />
              Your account
            </Link>
            <Link href="/track-order" onClick={() => setOpen(false)}>
              Track your order
            </Link>
          </div>
        </nav>
        <div className="header-actions">
          <button
            ref={searchButton}
            className="icon"
            onClick={() => {
              setSearch(!search);
              setOpen(false);
            }}
            aria-label="Search products"
            aria-expanded={search}
            aria-controls="store-search"
          >
            <Search size={20} />
          </button>
          <Link
            className="icon account-icon"
            href="/account"
            aria-label="Your account"
          >
            <UserRound size={20} />
          </Link>
          <Link
            className="icon"
            href="/wishlist"
            aria-label={`Wishlist, ${wishlist.length} items`}
          >
            <Heart size={20} />
            {wishlist.length > 0 && <b>{wishlist.length}</b>}
          </Link>
          <Link
            className="icon"
            href="/cart"
            aria-label={`Shopping bag, ${cart.reduce((s, l) => s + l.quantity, 0)} items`}
          >
            <ShoppingBag size={20} />
            <b>{cart.reduce((s, l) => s + l.quantity, 0)}</b>
          </Link>
        </div>
      </header>
      {search && (
        <form
          id="store-search"
          className="search-bar"
          action="/search"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSearch(false);
              searchButton.current?.focus();
            }
          }}
        >
          <Search size={20} />
          <input
            type="search"
            name="q"
            placeholder="Search our products..."
            autoFocus
            maxLength={100}
            aria-label="Search the collection"
          />
          <button className="btn btn-primary">Search</button>
          <button
            type="button"
            className="icon"
            aria-label="Close search"
            onClick={() => {
              setSearch(false);
              searchButton.current?.focus();
            }}
          >
            <X size={20} />
          </button>
        </form>
      )}
    </>
  );
}
