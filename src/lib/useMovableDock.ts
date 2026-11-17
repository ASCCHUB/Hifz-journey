"use client";
// Move an instruction/control dock with a separate drag handle (touch, mouse, pen, keyboard).
// Dragging the handle never triggers Quran word taps, text reveal, grading, or audio playback.
// Position is constrained to the visible screen; Reset restores responsive default placement.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";

type XY = { x: number; y: number; width: number };
type Drag = { pointerId: number; x: number; y: number; top: number; left: number; width: number; height: number };
const margin = 8;
const clamp = (v: number, low: number, high: number) => Math.min(Math.max(low, v), Math.max(low, high));

export function useMovableDock() {
  const [position, setPosition] = useState<XY | null>(null);
  const drag = useRef<Drag | null>(null);
  const node = useRef<HTMLElement | null>(null);
  const moveWithinView = (x: number, y: number, width: number, height: number): XY => ({
    x: clamp(x, margin, window.innerWidth - Math.min(width, window.innerWidth - margin * 2) - margin),
    y: clamp(y, margin, window.innerHeight - Math.min(height, window.innerHeight - margin * 2) - margin),
    width: Math.min(width, window.innerWidth - margin * 2),
  });
  useEffect(() => {
    if (!position) return;
    const clampPosition = () => {
      const el = node.current;
      if (!el) return;
      setPosition((old) => {
        if (!old) return null;
        const next = moveWithinView(old.x, old.y, old.width, el.getBoundingClientRect().height);
        return next.x === old.x && next.y === old.y && next.width === old.width ? old : next;
      });
    };
    window.addEventListener("resize", clampPosition, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clampPosition);
    if (node.current) observer?.observe(node.current);
    return () => { window.removeEventListener("resize", clampPosition); observer?.disconnect(); };
  }, [position !== null]); // only attach the observer when dock has been moved

  const panel = (target: HTMLElement) => target.closest<HTMLElement>(".mushaf-lesson-panel, .mushaf-recall-dock, .mushaf-reading-dock");
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const section = panel(e.currentTarget);
    if (!section) return;
    const rect = section.getBoundingClientRect();
    node.current = section;
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY,
      top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    setPosition(moveWithinView(d.left + e.clientX - d.x, d.top + e.clientY - d.y, d.width, d.height));
    e.preventDefault();
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = ({ ArrowLeft: [-28, 0], ArrowRight: [28, 0],
      ArrowUp: [0, -28], ArrowDown: [0, 28] } as Record<string, number[]>)[e.key];
    if (!delta && e.key !== "Home") return;
    e.preventDefault();
    if (e.key === "Home") { setPosition(null); return; }
    const section = panel(e.currentTarget);
    if (!section) return;
    node.current = section;
    const r = section.getBoundingClientRect();
    setPosition(moveWithinView(r.left + delta[0], r.top + delta[1], r.width, r.height));
  };
  const style: CSSProperties | undefined = position ? {
    position: "fixed", top: position.y, left: position.x, right: "auto",
    bottom: "auto", width: position.width, maxWidth: "calc(100vw - 16px)",
    zIndex: 45,
  } : undefined;
  return {
    style,
    moved: position !== null,
    reset: () => setPosition(null),
    handle: {
      onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown,
      style: { touchAction: "none", cursor: "grab" } as CSSProperties,
      title: "Drag to move the controls. Use arrow keys to move; Home restores the position.",
      "aria-label": "Move controls by dragging or arrow keys; Home to reset",
    },
  };
}
