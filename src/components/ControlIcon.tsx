"use client";
// Small, consistent inline control icons: no external font or network dependency.
import type { SVGProps } from "react";

export type ControlIconName = "book" | "search" | "list" | "settings" | "eye" | "eye-off" | "mic" | "pin" | "chevron-down" | "chevron-up" | "close" | "play" | "pause" | "bookmark" | "repeat" | "arrow-left" | "arrow-right" | "location";
const paths: Record<ControlIconName, React.ReactNode> = {
  book: <><path d="M12 6c-2.5-1.4-5.8-1.8-9-1.2v14c3.6-.6 6.6-.3 9 1.2 2.4-1.5 5.4-1.8 9-1.2v-14c-3.2-.6-6.5-.2-9 1.2Z"/><path d="M12 6v14"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M4 12a8 8 0 0 1 .1-1.2l-2-1.5 2-3.5 2.4 1A8 8 0 0 1 9 5.5L9.4 3h4.2l.4 2.5A8 8 0 0 1 16.5 7l2.4-1 2 3.5-2 1.5a8 8 0 0 1 0 2l2 1.5-2 3.5-2.4-1A8 8 0 0 1 14 18.5l-.4 2.5H9.4L9 18.5A8 8 0 0 1 6.5 17l-2.4 1-2-3.5 2-1.5A8 8 0 0 1 4 12Z"/></>,
  eye: <><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  "eye-off": <><path d="M3 3 21 21"/><path d="M9.8 5.2A11 11 0 0 1 12 5c6.3 0 10 7 10 7a16 16 0 0 1-3.4 4.2M6.1 6.1C3.5 8.1 2 12 2 12s3.7 7 10 7a10.6 10.6 0 0 0 4-.8"/><path d="M10 10a3 3 0 0 0 4 4"/></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></>,
  pin: <><path d="M12 22v-8m-5 0 1-5-2-3V4h12v2l-2 3 1 5H7Z"/></>,
  "chevron-down": <path d="m6 9 6 6 6-6"/>,
  "chevron-up": <path d="m6 15 6-6 6 6"/>,
  close: <path d="M5 5 19 19M19 5 5 19"/>,
  play: <path d="m8 5 12 7-12 7V5Z"/>,
  pause: <><path d="M8 5v14M16 5v14"/></>,
  bookmark: <path d="M5 3h14v18l-7-5-7 5V3Z"/>,
  repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4"/><path d="M21 13v3a2 2 0 0 1-2 2H3"/></>,
  "arrow-left": <path d="m12 5-7 7 7 7M5 12h14"/>,
  "arrow-right": <path d="m12 5 7 7-7 7M19 12H5"/>,
  location: <><path d="M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13Z"/><circle cx="12" cy="9" r="2.5"/></>,
};
export default function ControlIcon({ name, className = "", ...props }: SVGProps<SVGSVGElement> & { name: ControlIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" className={`inline-block h-[1.1em] w-[1.1em] shrink-0 align-[-.12em] ${className}`} {...props}>{paths[name]}</svg>;
}
