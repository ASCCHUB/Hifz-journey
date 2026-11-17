"use client";
// Recite (microphone) as a compact optional action: a small button that opens the existing MushafRecitation
// panel on demand. Nothing about speech recognition changes; it is only shown when the learner asks for it.
import { useState, type ComponentProps } from "react";
import MushafRecitation from "./MushafRecitation";

export default function ReciteToggle(props: ComponentProps<typeof MushafRecitation>) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="recite-toggle btn btn-sm self-start" onClick={() => setOpen(true)} aria-expanded="false">
    <span aria-hidden="true">🎙</span> Recite aloud (optional)
  </button>;
  return <div className="flex flex-col gap-1">
    <MushafRecitation {...props} />
    <button type="button" className="self-start text-xs underline text-muted" onClick={() => setOpen(false)} aria-expanded="true">Hide microphone</button>
  </div>;
}

/** Keep an element (the current Ayah) visible between the top of the screen and the top of a bottom dock. */
export function keepAboveDock(target: Element | null, dock: Element | null, margin = 16) {
  if (!target) return;
  const t = target.getBoundingClientRect();
  const limit = dock ? dock.getBoundingClientRect().top : window.innerHeight;
  if (t.bottom > limit - margin) window.scrollBy({ top: t.bottom - limit + margin * 2 });
  else if (t.top < 72) window.scrollBy({ top: t.top - 88 });
}
