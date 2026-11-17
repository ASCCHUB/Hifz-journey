package com.hifzcompanion;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Hifz and revision reminders, scheduled natively so they work while the app (and its WebView) is closed.
 *
 * Two independent activities, "hifz" (new memorization) and "rev" (Muraja'ah), each with:
 *   - an initial reminder at its own time, on the selected weekdays;
 *   - a follow-up "Did you complete ...?" after a configurable delay, only while today's task is unresolved,
 *     capped per day, with action buttons (Yes / Remind me later / Skip today).
 *
 * The web app is the source of truth for what is scheduled and whether it was done *in the app*: it reports a
 * per-activity state ("none" | "todo" | "done") for the local day through MainActivity's AndroidReminder bridge.
 * A notification answer is only a self-report: it is queued for the web app, which records it separately from
 * Hifz evidence. Nothing here can mark an Ayah memorized or change revision scheduling.
 *
 * Alarms are inexact (setAndAllowWhileIdle): Doze-safe and need no exact-alarm permission, but Android may
 * deliver them some minutes late. Re-armed on app open, boot, app update, and time / time-zone changes.
 * Times are wall-clock local times recomputed with Calendar on every scheduling, so DST shifts are followed.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "hifz_reminder";
    static final String CHANNEL = "hifz_reminders";
    static final String CHANNEL_SILENT = "hifz_reminders_silent";
    static final String ACTION_FIRE = "com.hifzcompanion.REMINDER";
    static final String ACTION_FOLLOW = "com.hifzcompanion.REMINDER_FOLLOW";
    static final String ACTION_RESPOND = "com.hifzcompanion.REMINDER_RESPOND";
    static final String[] KINDS = {"hifz", "rev"};

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String kind = intent.getStringExtra("kind");
        if (kind != null && !kind.equals("hifz") && !kind.equals("rev")) kind = null;
        if (ACTION_FIRE.equals(action) && kind != null) fireInitial(context, kind);
        else if (ACTION_FOLLOW.equals(action) && kind != null) fireFollow(context, kind);
        else if (ACTION_RESPOND.equals(action) && kind != null) respond(context, kind, intent.getStringExtra("answer"));
        else if (ACTION_FIRE.equals(action)) { /* alarm from an older build: just re-arm below */ }
        schedule(context); // after any event (fire, boot, update, time change): arm the next occurrences
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Local day number, matching the web app's today(): days since epoch in local time. */
    static long localDay() { return localDay(System.currentTimeMillis()); }
    static long localDay(long ms) {
        Calendar c = Calendar.getInstance(); c.setTimeInMillis(ms);
        long offset = c.get(Calendar.ZONE_OFFSET) + c.get(Calendar.DST_OFFSET);
        return Math.floorDiv(ms + offset, 86_400_000L);
    }

    // ---------- state helpers ----------
    static boolean enabled(SharedPreferences p, String kind) { return p.getBoolean("enabled", false) && p.getBoolean(kind + "On", true); }
    /** Web-reported state for today: "none" (nothing scheduled), "todo", "done"; "unknown" if not reported today. */
    static String state(SharedPreferences p, String kind) {
        return p.getLong(kind + "StateDay", -1) == localDay() ? p.getString(kind + "State", "unknown") : "unknown";
    }
    static boolean resolvedToday(SharedPreferences p, String kind) { return p.getLong(kind + "ResolvedDay", -1) == localDay(); }
    static boolean dayAllowed(SharedPreferences p, long ms) {
        Calendar c = Calendar.getInstance(); c.setTimeInMillis(ms);
        int dow = c.get(Calendar.DAY_OF_WEEK) - 1; // 0 = Sunday, like JavaScript getDay()
        return (p.getInt("days", 0x7F) & (1 << dow)) != 0;
    }
    static int minuteOfDay(long ms) { Calendar c = Calendar.getInstance(); c.setTimeInMillis(ms); return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE); }
    static boolean inQuiet(SharedPreferences p, long ms) {
        int qs = p.getInt("quietStart", -1), qe = p.getInt("quietEnd", -1);
        if (qs < 0 || qe < 0 || qs == qe) return false;
        int m = minuteOfDay(ms);
        return qs < qe ? (m >= qs && m < qe) : (m >= qs || m < qe);
    }
    /** Move a time out of quiet hours (to the quiet-hours end). */
    static long afterQuiet(SharedPreferences p, long ms) {
        if (!inQuiet(p, ms)) return ms;
        int qe = p.getInt("quietEnd", -1);
        Calendar c = Calendar.getInstance(); c.setTimeInMillis(ms);
        c.set(Calendar.HOUR_OF_DAY, qe / 60); c.set(Calendar.MINUTE, qe % 60); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= ms) c.add(Calendar.DAY_OF_YEAR, 1);
        return c.getTimeInMillis();
    }

    // ---------- firing ----------
    static void fireInitial(Context context, String kind) {
        SharedPreferences p = prefs(context);
        long day = localDay();
        if (!enabled(p, kind) || !dayAllowed(p, System.currentTimeMillis())) return;
        if (p.getLong(kind + "InitialDay", -1) == day) return; // duplicate suppression: one initial per day
        p.edit().putLong(kind + "InitialDay", day).apply();
        String st = state(p, kind);
        if (st.equals("done") || st.equals("none") || resolvedToday(p, kind)) return; // done in the app, nothing scheduled, or answered
        notify(context, kind, false);
        // arm the follow-up
        long at = afterQuiet(p, System.currentTimeMillis() + Math.max(15, p.getInt("followUp", 60)) * 60_000L);
        p.edit().putLong(kind + "FollowAt", at).apply();
    }

    static void fireFollow(Context context, String kind) {
        SharedPreferences p = prefs(context);
        long day = localDay();
        p.edit().remove(kind + "FollowAt").apply();
        if (!enabled(p, kind)) return;
        String st = state(p, kind);
        if (st.equals("done") || st.equals("none") || resolvedToday(p, kind)) return;
        int count = p.getLong(kind + "FollowDay", -1) == day ? p.getInt(kind + "FollowCount", 0) : 0;
        if (count >= Math.max(0, p.getInt("maxFollow", 2))) return;
        if (inQuiet(p, System.currentTimeMillis())) { p.edit().putLong(kind + "FollowAt", afterQuiet(p, System.currentTimeMillis())).apply(); return; }
        p.edit().putLong(kind + "FollowDay", day).putInt(kind + "FollowCount", count + 1).apply();
        notify(context, kind, true);
    }

    /** A tap on a notification action button. Records a self-report; never touches Hifz evidence. */
    static void respond(Context context, String kind, String answer) {
        if (answer == null) return;
        SharedPreferences p = prefs(context);
        long day = localDay();
        SharedPreferences.Editor e = p.edit();
        if (answer.equals("yes") || answer.equals("skip")) e.putLong(kind + "ResolvedDay", day).remove(kind + "FollowAt");
        else if (answer.equals("later")) e.putLong(kind + "FollowAt", afterQuiet(p, System.currentTimeMillis() + Math.max(15, p.getInt("followUp", 60)) * 60_000L));
        else return;
        queue(p, e, kind, answer, day);
        e.apply();
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(notifId(kind));
    }

    /** Responses waiting for the web app to read (it records them as self-reports). Capped. */
    static void queue(SharedPreferences p, SharedPreferences.Editor e, String kind, String answer, long day) {
        try {
            JSONArray a = new JSONArray(p.getString("responses", "[]"));
            JSONObject o = new JSONObject().put("kind", kind).put("answer", answer).put("day", day).put("at", System.currentTimeMillis());
            a.put(o);
            while (a.length() > 30) a.remove(0);
            e.putString("responses", a.toString());
        } catch (Exception ignored) { }
    }

    static int notifId(String kind) { return kind.equals("hifz") ? 7 : 8; }

    static void ensureChannels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Hifz & revision reminders", NotificationManager.IMPORTANCE_DEFAULT));
        NotificationChannel quiet = new NotificationChannel(CHANNEL_SILENT, "Hifz & revision reminders (silent)", NotificationManager.IMPORTANCE_LOW);
        quiet.setSound(null, null);
        nm.createNotificationChannel(quiet);
    }

    static PendingIntent openApp(Context context, String path, int code) {
        Intent open = new Intent(context, MainActivity.class).putExtra("path", path).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, code, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent action(Context context, String kind, String answer, int code) {
        Intent i = new Intent(context, ReminderReceiver.class).setAction(ACTION_RESPOND).putExtra("kind", kind).putExtra("answer", answer);
        return PendingIntent.getBroadcast(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void notify(Context context, String kind, boolean followUp) {
        SharedPreferences p = prefs(context);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannels(nm);
        boolean hifz = kind.equals("hifz");
        String summary = p.getLong(kind + "StateDay", -1) == localDay() ? p.getString(kind + "Summary", "") : "";
        String title, text;
        if (followUp) {
            title = hifz ? "Did you complete your Hifz today?" : "Did you complete your revision today?";
            text = "Tap to answer or open today's " + (hifz ? "lesson" : "revision") + ".";
        } else {
            title = hifz ? "Time for your Hifz" : "Time for revision";
            text = summary != null && !summary.isEmpty() ? summary : hifz ? "Continue today's Quran memorization." : "Your scheduled Muraja'ah is ready.";
        }
        int base = hifz ? 100 : 200;
        String path = followUp ? "/checkin?kind=" + kind : (hifz ? "/journey?start=hifz" : "/journey?start=rev");
        boolean silent = "silent".equals(p.getString("sound", "default"));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, silent ? CHANNEL_SILENT : CHANNEL) : new Notification.Builder(context);
        b.setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setContentIntent(openApp(context, path, base))
            .setOnlyAlertOnce(true)
            .setAutoCancel(true);
        if (followUp) {
            b.addAction(new Notification.Action.Builder(null, "Yes, completed", action(context, kind, "yes", base + 1)).build());
            b.addAction(new Notification.Action.Builder(null, "Remind me later", action(context, kind, "later", base + 2)).build());
            b.addAction(new Notification.Action.Builder(null, "Skip today", action(context, kind, "skip", base + 3)).build());
        }
        try { nm.notify(notifId(kind), b.build()); } catch (SecurityException ignored) { /* notification permission not granted */ }
    }

    /** Show a sample right now so the user can check notifications work (does not change any state). */
    static void test(Context context, String kind, boolean followUp) { notify(context, kind, followUp); }

    // ---------- scheduling ----------
    static PendingIntent alarm(Context context, String action, String kind, int code) {
        Intent i = new Intent(context, ReminderReceiver.class).setAction(action).putExtra("kind", kind);
        return PendingIntent.getBroadcast(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Next initial reminder for a kind: its time today or on a following allowed weekday, out of quiet hours. */
    static long nextInitial(SharedPreferences p, String kind, long now) {
        int min = p.getInt(kind + "Min", kind.equals("hifz") ? 20 * 60 : 6 * 60);
        long day = localDay(now);
        for (int d = 0; d <= 7; d++) {
            Calendar c = Calendar.getInstance(); c.setTimeInMillis(now); c.add(Calendar.DAY_OF_YEAR, d);
            c.set(Calendar.HOUR_OF_DAY, min / 60); c.set(Calendar.MINUTE, min % 60); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
            long t = c.getTimeInMillis();
            if (t <= now + 30_000L || !dayAllowed(p, t)) continue;
            if (localDay(t) == day && p.getLong(kind + "InitialDay", -1) == day) continue; // already reminded today
            return afterQuiet(p, t);
        }
        return -1;
    }

    /** Arm (or cancel) every alarm from the current preferences. Safe to call any number of times. */
    static void schedule(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        SharedPreferences p = prefs(context);
        am.cancel(legacyAlarm(context));
        long now = System.currentTimeMillis();
        for (int k = 0; k < KINDS.length; k++) {
            String kind = KINDS[k];
            PendingIntent init = alarm(context, ACTION_FIRE, kind, 10 + k), follow = alarm(context, ACTION_FOLLOW, kind, 20 + k);
            am.cancel(init); am.cancel(follow);
            if (!enabled(p, kind)) continue;
            long next = nextInitial(p, kind, now);
            if (next > 0) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, init);
            long f = p.getLong(kind + "FollowAt", -1);
            if (f > 0 && localDay(f) == localDay(now) && !resolvedToday(p, kind)) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, Math.max(f, now + 60_000L), follow);
        }
    }

    /** The single alarm used by builds before separate Hifz/revision reminders; cancelled so it cannot double-fire. */
    static PendingIntent legacyAlarm(Context context) {
        Intent i = new Intent(context, ReminderReceiver.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(context, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
