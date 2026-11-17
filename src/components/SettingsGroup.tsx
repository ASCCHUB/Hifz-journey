"use client";
// A settings group with progressive disclosure: a clear title and one-line summary; contents open on tap.
// A link to #id (e.g. /profile#reminders) opens the group.
import { useEffect, useRef, type ReactNode } from "react";

export default function SettingsGroup({ id, title, summary, open = false, children }: { id?: string; title: string; summary?: string; open?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const check = () => { if (id && ref.current && window.location.hash === `#${id}`) { ref.current.open = true; ref.current.scrollIntoView({ block: "start" }); } };
    check(); window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [id]);
  return <details ref={ref} id={id} className="settings-group card !p-0" open={open}>
    <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0"><span className="block font-semibold">{title}</span>{summary && <span className="block text-sm text-muted">{summary}</span>}</span>
      <span aria-hidden="true" className="settings-group-chevron text-xl text-muted">›</span>
    </summary>
    <div className="flex flex-col gap-3 border-t border-line px-4 py-3">{children}</div>
  </details>;
}
