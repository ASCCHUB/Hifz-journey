"use client";
// Screen Wake Lock for supported Safari/Chrome/etc, and a native Android WebView flag.
// Locks are released when hidden/unmounted; the browser can reject them for battery policy.
import { useEffect, useState } from "react";
import { getScreenAwakeEnabled, SCREEN_AWAKE_CHANGE, setScreenAwakeEnabled } from "@/lib/screenAwake";

type Sentinel = { release: () => Promise<void>; addEventListener: (name: string, callback: () => void) => void };
type WakeNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };
type AndroidWithWake = { setKeepScreenOn?: (enabled: boolean) => void };

function setAndroidAwake(enabled: boolean) {
  try {
    const nativeApp = (window as Window & { AndroidApp?: AndroidWithWake }).AndroidApp;
    nativeApp?.setKeepScreenOn?.(enabled);
  } catch { /* ordinary website or older APK */ }
}

export function ScreenAwakeController() {
  useEffect(() => {
    let active = true;
    let sequence = 0;
    let lock: Sentinel | null = null;
    const releaseLock = () => { const old = lock; lock = null; if (old) void old.release().catch(() => {}); };
    const updateLock = async () => {
      const thisRun = ++sequence;
      const shouldKeep = active && getScreenAwakeEnabled() && document.visibilityState === "visible";
      setAndroidAwake(shouldKeep);
      if (!shouldKeep) { releaseLock(); return; }
      if (lock) return;
      const api = (navigator as WakeNavigator).wakeLock;
      if (!api) return; // Older Safari/iOS browsers can lack the API.
      try {
        const next = await api.request("screen");
        if (!active || thisRun !== sequence || document.visibilityState !== "visible" || !getScreenAwakeEnabled()) {
          void next.release().catch(() => {}); return;
        }
        lock = next;
        next.addEventListener("release", () => { if (lock === next) lock = null; });
      } catch { /* Permissions/battery may deny the request; native Android still works. */ }
    };
    const sync = () => { void updateLock(); };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener(SCREEN_AWAKE_CHANGE, sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("pagehide", sync);
    sync();
    return () => {
      active = false; sequence++;
      releaseLock();
      setAndroidAwake(false);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener(SCREEN_AWAKE_CHANGE, sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("pagehide", sync);
    };
  }, []);
  return null;
}

export function ScreenAwakeSetting() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    setEnabled(getScreenAwakeEnabled());
    const sync = () => setEnabled(getScreenAwakeEnabled());
    window.addEventListener(SCREEN_AWAKE_CHANGE, sync);
    return () => window.removeEventListener(SCREEN_AWAKE_CHANGE, sync);
  }, []);
  return <div className="flex flex-col gap-1 rounded-xl border border-line p-3">
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="font-semibold">Keep screen awake while using Hifz Journey</span>
      <input aria-label="Keep screen awake" type="checkbox" className="h-5 w-5 shrink-0 accent-current"
        checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setScreenAwakeEnabled(e.target.checked); }}/>
    </label>
    <p className="text-xs text-muted">On by default. Prevents the screen from timing out while this app is visible. Turns off when you leave the app. Some browsers, especially older iOS versions, do not support screen wake lock; device battery and power-saving settings can override it.</p>
  </div>;
}
