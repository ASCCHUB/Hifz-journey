"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { update, useStore } from "@/lib/store";

/** One-tap switch between dark and light. Saves an explicit choice (Profile still offers "Match my device"). */
function ThemeToggle() {
  const theme = useStore().settings.theme;
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => setDark(theme === "dark" || (theme === "auto" && mq.matches));
    read(); mq.addEventListener("change", read); return () => mq.removeEventListener("change", read);
  }, [theme]);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" className="page-topbar-icon btn" aria-label={label} title={label} onClick={() => update((d) => { d.settings.theme = dark ? "light" : "dark"; })}>
    {dark
      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-5 w-5"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>}
  </button>;
}

type MenuItem = readonly [href: string, label: string];
export default function PageTopBar({
  title, menuItems, menuOpen, onToggleMenu, onNavigate, onSearch,
}: {
  title: string;
  menuItems: readonly MenuItem[];
  menuOpen: boolean;
  onToggleMenu: () => void;
  onNavigate: (href: string) => void;
  onSearch: () => void;
}) {
  return <header className="page-topbar flex min-h-14 items-center justify-between gap-3 border-b border-line pb-3" aria-label="Page header">
    <h1 className="min-w-0 truncate text-xl font-bold">{title}</h1>
    <div className="relative flex shrink-0 items-center gap-2">
      <ThemeToggle />
      <button type="button" className="page-topbar-icon btn" aria-label="Search Quran" title="Search Quran" onClick={onSearch}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-5 w-5"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
      </button>
      <button type="button" className="btn page-topbar-more" aria-haspopup="menu" aria-expanded={menuOpen} onClick={onToggleMenu}>More</button>
      {menuOpen && <div className="page-topbar-menu" role="menu" aria-label="More destinations">
        {menuItems.map(([href, label]) => <Link key={href} role="menuitem" className="page-topbar-menu-item" href={href} onClick={() => onNavigate(href)}>{label}</Link>)}
      </div>}
    </div>
  </header>;
}
