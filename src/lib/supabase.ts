"use client";
// Supabase: authentication (email + Google) and cloud sync of each user's private state.
// Without the two env keys the app runs in guest mode and keeps everything on the device.
//
// Sync model (Phase 3.1A): every sync reads the cloud row, merges it field-by-field with the local state
// (lib/sync.ts mergeStates — evidence is unioned, deletions are tombstones), and writes back only if the
// row is unchanged since it was read (compare-and-swap on the existing `updated_at` column). If another
// device wrote in between, the write is refused and the loop re-reads and merges again. Local data is never
// replaced wholesale, and a snapshot is kept before the local state changes because of a sync.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getState, hydrateState, replaceState, saveSnapshot, setChangeHandler, type AppState } from "./store";
import { mergeStates, reconcile, sameData, type SyncBackend } from "./sync";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = !!(url && anon);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) client = createClient(url!, anon!, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
  return client;
}

export type SyncStatus = "guest" | "syncing" | "synced" | "error" | "offline";
let status: SyncStatus = "guest";
const statusListeners = new Set<(s: SyncStatus) => void>();
const setStatus = (s: SyncStatus) => { status = s; statusListeners.forEach((l) => l(s)); };
export const getSyncStatus = () => status;
export const onSyncStatus = (fn: (s: SyncStatus) => void) => { statusListeners.add(fn); return () => { statusListeners.delete(fn); }; };

/** Sync protocol spoken by this build. The B4 server guard rejects writes from protocol-1 (legacy) clients. */
export const SYNC_PROTOCOL = 2;
/** Whether the server-side revision guard (supabase/migrations/20261114_b4_*) is installed, as last observed. */
export type CloudProtection = "unknown" | "server-guard" | "not-installed";
let protection: CloudProtection = "unknown";
let detail = "";
export const getCloudProtection = () => protection;
export const getSyncDetail = () => detail;

/** A write the server refused on purpose (outdated client / forbidden). Never retried silently. */
export class SyncRejected extends Error { constructor(msg: string) { super(msg); this.name = "SyncRejected"; } }
const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /column .*(revision|sync_protocol).* does not exist|Could not find the '(revision|sync_protocol)' column/i.test(e.message || ""));

/**
 * Supabase implementation of the sync storage contract, scoped to one user row.
 * With the B4 guard installed the version token is the server-enforced `revision` (an UPDATE must set exactly
 * revision+1, filtered by the revision we read). Without it (migration not yet deployed) it falls back to
 * `updated_at` compare-and-swap — which does NOT stop legacy clients; that state is reported as "not-installed".
 */
export function supabaseBackend(sb: SupabaseClient, userId: string): SyncBackend {
  let guarded: boolean | null = null;
  const reject = (e: { code?: string; message?: string }) => {
    const m = e.message || "";
    if (/HIFZ_SYNC_REVISION_CONFLICT/.test(m)) return false;                       // someone wrote first: re-read + merge
    if (/HIFZ_SYNC_(OUTDATED_CLIENT|FORBIDDEN)/.test(m)) throw new SyncRejected(m); // refused on purpose
    throw e;
  };
  return {
    async read() {
      if (guarded !== false) {
        const { data, error } = await sb.from("user_state").select("state, revision").eq("user_id", userId).maybeSingle();
        if (!error) { guarded = true; protection = "server-guard"; return data ? { state: data.state, version: String(data.revision | 0) } : null; }
        if (!isMissingColumn(error)) throw error;
        guarded = false; protection = "not-installed";
      }
      const { data, error } = await sb.from("user_state").select("state, updated_at").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ? { state: data.state, version: String(data.updated_at) } : null;
    },
    async insert(state, version) {
      const row: Record<string, unknown> = guarded ? { user_id: userId, state, revision: 1, sync_protocol: SYNC_PROTOCOL } : { user_id: userId, state, updated_at: version };
      const { error } = await sb.from("user_state").insert(row);
      if (!error) return true;
      if (error.code === "23505") return false; // row created meanwhile by another device
      return reject(error);
    },
    async replaceIf(expected, state, version) {
      if (guarded) {
        const rev = Number(expected);
        const { data, error } = await sb.from("user_state").update({ state, revision: rev + 1, sync_protocol: SYNC_PROTOCOL }).eq("user_id", userId).eq("revision", rev).select("revision");
        if (error) return reject(error);
        return !!data && data.length === 1; // 0 rows: the revision moved on — re-read and merge
      }
      const { data, error } = await sb.from("user_state").update({ state, updated_at: version }).eq("user_id", userId).eq("updated_at", expected).select("user_id");
      if (error) throw error;
      return !!data && data.length === 1;
    },
  };
}
// A strictly increasing version token per device (a server timestamp column; uniqueness, not clock accuracy, matters).
let lastVersion = 0;
const nextVersion = () => { lastVersion = Math.max(Date.now(), lastVersion + 1); return new Date(lastVersion).toISOString(); };

let generation = 0, activeUser: string | null = null, running: Promise<void> | null = null, again = false;
let timer: ReturnType<typeof setTimeout> | null = null, poll: ReturnType<typeof setInterval> | null = null;

/** One reconciliation round. Serialized: concurrent calls coalesce into one follow-up run. */
async function syncNow(user: User, gen: number) {
  const sb = supabase(); if (!sb) return;
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      if (activeUser !== user.id || gen !== generation) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) { setStatus("offline"); return; }
      setStatus("syncing");
      try {
        const before = getState();
        const merged = await reconcile(supabaseBackend(sb, user.id), before, (s) => hydrateState(s as AppState), nextVersion);
        if (activeUser !== user.id || gen !== generation) return;
        // Local edits may have happened while the network call was in flight: merge them in, never drop them.
        const now = getState();
        const adopt = now === before ? merged : mergeStates(now, merged);
        if (!sameData(adopt, now)) { saveSnapshot("before applying changes from another device"); replaceState(adopt); }
        if (now !== before) again = true; // push the edits made during the round
        detail = protection === "not-installed" ? "Cloud protection against older app versions is not installed on the server yet (B4 migration)." : ""; setStatus("synced");
      } catch (e) {
        // Local state is never touched by a failed or refused cloud write.
        detail = e instanceof SyncRejected
          ? "The cloud refused this update because this copy of the app uses an outdated sync method. Your progress is safe on this device; please install the latest version of the app to sync."
          : e instanceof Error && /sync-conflict-retries-exhausted/.test(e.message) ? "Another device kept changing your cloud progress; sync will try again shortly. Your progress is safe on this device." : "";
        setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
      }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

export async function startSync(user: User) {
  if (!supabase() || activeUser === user.id) return;
  const gen = ++generation; activeUser = user.id;
  setChangeHandler(() => { if (activeUser !== user.id || gen !== generation) return; if (timer) clearTimeout(timer); timer = setTimeout(() => void syncNow(user, gen), 2000); });
  if (typeof window !== "undefined") {
    const kick = () => void syncNow(user, gen);
    window.addEventListener("online", kick);
    poll = setInterval(() => { if (document.visibilityState === "visible") kick(); }, 60_000); // pick up other devices' changes
    const prevStop = stopHooks; stopHooks = () => { prevStop(); window.removeEventListener("online", kick); };
  }
  await syncNow(user, gen);
}
let stopHooks = () => {};
export function stopSync() {
  generation++; activeUser = null; again = false; setChangeHandler(null);
  if (timer) clearTimeout(timer); timer = null;
  if (poll) clearInterval(poll); poll = null;
  stopHooks(); stopHooks = () => {};
  setStatus("guest");
}
