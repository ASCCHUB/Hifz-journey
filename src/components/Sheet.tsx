"use client";
import ControlIcon from "./ControlIcon";
import { useEffect, type ReactNode } from "react";

export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 lg:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-label={title} className="fade-in flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-auto rounded-t-3xl bg-surface p-5 lg:rounded-3xl">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{title}</h2><button className="btn btn-sm" onClick={onClose}><ControlIcon name="close" /> Close</button></div>
      {children}
    </div>
  </div>;
}
