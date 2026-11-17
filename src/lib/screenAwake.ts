// Device-only preference. The page keeps the screen awake only while visible.
// This is unrelated to Quran text, Hifz progress, or cloud sync.
const KEY = "hifz-screen-awake-v1";
export const SCREEN_AWAKE_CHANGE = "hifz-screen-awake-change";
export function getScreenAwakeEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setScreenAwakeEnabled(enabled: boolean): void {
  try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch { /* private mode */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SCREEN_AWAKE_CHANGE));
}
