"use client";
// App frame: loads the Quran data, applies the theme, runs auth and sync, and draws the navigation
// (sidebar on desktop, bottom bar on mobile).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { loadCore } from "@/lib/quran";
import { logAdd, setProfile, update, useStore } from "@/lib/store";
import { startSync, stopSync, supabase } from "@/lib/supabase";
import { activityStatus, pushReminder, recordCheckin, takeNativeResponses } from "@/lib/reminder";
import { AudioBar, AudioProvider } from "./Audio";
import { SaveBanner } from "./SaveStatus";
import SearchDialog from "./SearchDialog";
import PageTopBar from "./PageTopBar";
import { ScreenAwakeController } from "./ScreenAwake";

const UserCtx = createContext<User | null>(null);
export const useUser = () => useContext(UserCtx);

const ICONS: Record<string, string> = {
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  mushaf: "M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13",
  recite: "M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
  memorize: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z",
  mindmap: "M7 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm15 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM7 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zm15 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM5 8v8m14-8v8M7 6h10M7 18h10",
  profile: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
};
export const Icon = ({ name, className = "w-6 h-6" }: { name: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={ICONS[name]} /></svg>
);
const NAV = [
  { href: "/journey", label: "Dashboard", icon: "memorize" },
  { href: "/learn", label: "New Learning", icon: "mushaf" },
  { href: "/revision", label: "Revision", icon: "recite" },
  { href: "/quran", label: "My Quran", icon: "home" },
];
const MORE = [
  ["/mind-maps", "Visual Maps"], ["/recite", "Recite"], ["/mushaf", "Read Mushaf"],
  ["/progress", "Progress"], ["/journey-settings", "Journey Settings"], ["/profile", "Settings"],
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const st = useStore();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showTopMore, setShowTopMore] = useState(false);
  // A tap on the Quran/page outside an open menu dismisses it without changing location.
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".page-topbar-more, .page-topbar-menu")) setShowTopMore(false);
      if (!target.closest("nav[aria-label='Main'], .main-bottom-nav")) setShowMore(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  const [showSearch, setShowSearch] = useState(false);
  const [mushafLearn, setMushafLearn] = useState(false);
  const [mushafRecall, setMushafRecall] = useState(false);

  useEffect(() => { loadCore().then(() => setReady(true)).catch(() => setFailed(true)); }, []);

  // Theme: explicit choice, or follow the device.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", st.settings.theme === "dark" || (st.settings.theme === "auto" && mq.matches));
    apply(); mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [st.settings.theme]);

  // Auth session and cloud sync.
  useEffect(() => {
    const sb = supabase(); if (!sb) return;
    let currentId: string | null = null;
    const activate = (u: User | null) => {
      if (currentId === (u?.id ?? null)) return;
      stopSync(); currentId = u?.id ?? null; setProfile(currentId); setUser(u);
      if (u) void startSync(u);
    };
    sb.auth.getSession().then(({ data }) => activate(data.session?.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      activate(session?.user ?? null);
    });
    return () => { sub.subscription.unsubscribe(); stopSync(); };
  }, []);

  // Daily reminder (Android): keep the native alarm and "what is left today" up to date, debounced.
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => pushReminder(st), 1500);
    return () => clearTimeout(id);
  }, [st, ready]);

  // Notification-button answers made while the app was closed: record them as self-reports (never evidence).
  useEffect(() => {
    if (!ready) return;
    const take = () => { const r = takeNativeResponses(); if (r.length) update((d) => { r.forEach((x) => recordCheckin(d, x.kind, x.answer, "notification", x.day, x.at)); }); };
    take();
    const onVis = () => { if (document.visibilityState === "visible") take(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [ready]);

  // A reminder tap opens /journey?start=hifz|rev: go straight to the first real task of that kind, if any.
  useEffect(() => {
    if (!ready || path !== "/journey") return;
    const k = new URLSearchParams(window.location.search).get("start");
    if (k !== "hifz" && k !== "rev") return;
    const s = activityStatus(st, k);
    router.replace(s.state === "todo" && s.href ? s.href : "/journey");
  }, [ready, path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Service worker for installability and offline use.
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);

  // Count time spent reading and reciting.
  useEffect(() => {
    if (!["/mushaf", "/recite", "/memorize"].some((p) => path.startsWith(p))) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") update((d) => logAdd(d, "t", 30)); }, 30000);
    return () => clearInterval(id);
  }, [path]);
  useEffect(() => { setShowMore(false); setShowTopMore(false); }, [path]);

  useEffect(() => {
    const syncMode = (event?: Event) => {
      const detail = (event as CustomEvent<string> | undefined)?.detail;
      const m = detail || (window.location.pathname === "/mushaf" ? new URLSearchParams(window.location.search).get("mode") : null);
      setMushafLearn(m === "learn"); setMushafRecall(m === "recall");
    };
    syncMode();
    window.addEventListener("hifz-mushaf-mode", syncMode);
    window.addEventListener("popstate", syncMode);
    return () => { window.removeEventListener("hifz-mushaf-mode", syncMode); window.removeEventListener("popstate", syncMode); };
  }, [path]);

  const active = (href: string) => {
    if (path.startsWith("/mushaf") && href === "/learn") return mushafLearn;
    if (path.startsWith("/mushaf") && href === "/mushaf") return !mushafLearn;
    return href === "/" ? path === "/" : path.startsWith(href);
  };
  const topTitle = path === "/journey" ? "Dashboard" : path === "/learn" ? "New Learning"
    : path === "/mushaf" ? (mushafLearn ? "Mushaf Learn" : mushafRecall ? "Mushaf Recall" : "Read Mushaf")
    : path === "/revision" ? "Your Revision" : path === "/quran" ? "My Quran"
    : path === "/progress" ? "Progress" : path === "/journey-settings" ? "Journey Settings" : path === "/profile" ? "Settings"
    : path === "/prayer-settings" ? "Prayer Times & Calendar" : path === "/recall" ? "Recall" : "";
  return (
    <UserCtx.Provider value={user}>
      <AudioProvider>
        <ScreenAwakeController />
        <SaveBanner />
        <nav aria-label="Main" className="hidden lg:flex fixed inset-y-0 left-0 w-[220px] flex-col gap-1 border-r border-line bg-surface p-4 z-20">
          <div className="px-3 py-4 text-lg font-bold text-accent">Hifz Journey</div>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 font-semibold ${active(n.href) ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}>
              <Icon name={n.icon} className="w-5 h-5" />{n.label}
            </Link>
          ))}
          <button type="button" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-start font-semibold ${showMore || MORE.some(([href]) => active(href)) ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}><span className="w-5 text-center text-xl leading-none" aria-hidden>•••</span>More</button>
          {showMore && <div className="flex flex-col gap-1 rounded-xl border border-line p-2" aria-label="More destinations">{MORE.map(([href, label]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} onClick={() => { if (href === "/mushaf") setMushafLearn(false); }} className={`rounded-lg px-3 py-3 text-sm ${active(href) ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-accent-soft hover:text-accent"}`}>{label}</Link>)}</div>}
        </nav>
        <main className="lg:pl-[220px] pb-28 lg:pb-28">
          <div className={`mx-auto px-4 py-5 fade-in ${path.startsWith("/mind-maps") ? "max-w-[1760px]" : path.startsWith("/mushaf") || path.startsWith("/recite") ? "max-w-7xl" : path.startsWith("/quran") || path.startsWith("/progress") ? "max-w-6xl" : "max-w-5xl"}`} key={path}>
            {topTitle && <PageTopBar title={topTitle} menuItems={MORE} menuOpen={showTopMore} onToggleMenu={() => setShowTopMore((v) => !v)} onNavigate={(href) => { setShowTopMore(false); setShowMore(false); if (href === "/mushaf") setMushafLearn(false); }} onSearch={() => setShowSearch(true)} />}
            {failed ? <div className="card">The Quran text could not be loaded. Check your connection and reload the page.</div>
              : ready ? children
              : <div className="card text-muted">Loading the Quran…</div>}
          </div>
        </main>
        {ready && <AudioBar />}
        <nav aria-label="Main" className="main-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface grid grid-cols-5 h-auto min-h-[64px] pb-[env(safe-area-inset-bottom)]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${active(n.href) ? "text-accent" : "text-muted"}`}>
              <Icon name={n.icon} className="w-[22px] h-[22px]" /><span className="text-[10px] sm:text-xs">{n.label === "Dashboard" ? "Dashboard" : n.label === "New Learning" ? "Learn" : n.label}</span>
            </Link>
          ))}
          <button type="button" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)} className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${showMore || MORE.some(([href]) => active(href)) ? "text-accent" : "text-muted"}`}><span className="text-xl leading-[22px]" aria-hidden>•••</span><span className="text-[10px] sm:text-xs">More</span></button>
          {showMore && <div className="fixed inset-x-2 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-md grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xl" aria-label="More destinations">{MORE.map(([href, label]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} onClick={() => { setShowMore(false); if (href === "/mushaf") setMushafLearn(false); }} className={`btn justify-center text-center ${active(href) ? "btn-on" : ""}`}>{label}</Link>)}</div>}
        </nav>
        {showSearch && <SearchDialog onClose={() => setShowSearch(false)} onGo={(hit) => {
          setShowSearch(false); setMushafLearn(false);
          if (hit.s && hit.a) router.push(`/mushaf?s=${hit.s}&a=${hit.a}`);
          else if (hit.pg) router.push(`/mushaf?p=${hit.pg}`);
        }} />}
      </AudioProvider>
    </UserCtx.Provider>
  );
}

export { default as Sheet } from "./Sheet";
export function Ring({ value, max, label }: { value: number; max: number; label: string }) {
  const p = Math.min(100, max ? (value / max) * 100 : 0);
  return (
    <div className="w-20 h-20 rounded-full grid place-items-center shrink-0" style={{ background: `conic-gradient(var(--accent) ${p}%, var(--line) 0)` }} role="img" aria-label={label}>
      <div className="w-[62px] h-[62px] rounded-full bg-surface grid place-items-center font-bold tabular-nums">{value}/{max}</div>
    </div>
  );
}
export const Bar = ({ value, color = "var(--accent)" }: { value: number; color?: string }) => (
  <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} /></div>
);
