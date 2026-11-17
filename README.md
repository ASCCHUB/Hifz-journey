# Hifz Companion

A Quran reading, recitation and memorization app: Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase.
Installable as a PWA, with a desktop sidebar and a mobile bottom bar.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production
```

The app works straight away in guest mode: progress is saved in the browser.

## Turn on accounts and sync (Supabase)

1. Create a project at supabase.com.
2. SQL editor → paste and run `supabase/schema.sql`.
3. Authentication → Providers: keep Email on; enable Google and add your Google OAuth client ID and secret.
4. Authentication → URL configuration: add your site URL and `<site>/profile` as a redirect URL.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key. Restart.

Each user's state is one row in `user_state`, protected by row level security so only that user can read or write it.
On sign-in the app keeps whichever copy (device or cloud) is newer, then pushes changes two seconds after each edit.

**Not yet tested against a live Supabase project.** The auth and sync code compiles and follows the Supabase JS v2 API,
but sign-up, Google sign-in and sync need checking once your project exists.

## What is in this first version

| Section | What works |
| --- | --- |
| Home | Greeting, Hijri and Gregorian dates, daily ayah with translation, continue reading, daily targets, streak, weekly chart, goals |
| Mushaf | All 604 Madinah pages in 15 lines, surah/juz/page navigation, swipe, zoom, search, bookmarks and favourites, last-read position, tap an ayah for translation and tafsir, memorize mode with word-level mistake marking |
| Audio | Seven reciters, play/pause, next/previous ayah, repeat ayah / range / surah, speed, lock-screen controls, save a surah for offline |
| Recite | Any surah and ayah range; self-check mode; microphone follow-along where the browser has speech recognition |
| Memorize | Ayah-by-ayah records, spaced revision, next-lesson recommendation, weak ayat drill, tracker for 114 surahs with five statuses, by-juz marking, calendar, daily targets |
| Profile | Sign-in, sync status, analytics, heatmap, goals, bookmarks, settings (theme, translation, reciter), backup code |

## Honest limits

- **Recitation checking is basic.** The microphone mode uses the browser's general Arabic speech-to-text and matches words
  against the ayah. It can flag a skipped or unmatched word and can also mishear correct recitation. It does not assess
  tajweed, makharij or pronunciation, and is not a Quran-specific model. A real recitation model (for example a Whisper
  model fine-tuned on Quran audio, served from your own backend) is the next step and should replace `follow()` in
  `src/app/recite/page.tsx`.
- **Audio and offline audio are untested here.** The build machine could not reach everyayah.com. File names follow its
  `SSSAAA.mp3` pattern and the folder names were read from its listing page. Saved-for-offline audio uses opaque cached
  responses, which some browsers refuse to seek within.
- **Urdu tafsir needs a connection.** It is fetched per ayah from the open `spa5k/tafsir_api` project, and was not
  reviewed. Tafsir Al-Muyassar and the three translations ship with the app.
- **Reminders are not built.** Web push needs a server key and a push service; plan it with the Android wrapper.

## Quran text and how it was checked

- Text: Uthmani script, Hafs from Asim, from the Noble Quran Encyclopedia (quranenc.com) via the `quran-json` package.
  It is stored in `public/data/quran.json` and never edited or generated in code.
- Check: run `npm run validate:quran` to compare the full app dataset with the pinned King Fahd Complex Uthmanic Hafs v2.0 developer dataset in `scripts/reference/`. The validator writes every remaining discrepancy to `scripts/quran-reference-differences.csv` and exits with status 2 when differences exist. It never changes either Quran file.
- The QuranEnc snapshot hash and reference package details are recorded in `scripts/reference/README.md`. The precise upstream quran-json package version was not preserved by the project, so the app copy is pinned by its local SHA-256. This is a digital comparison, not a qualified Hafiz review or a publisher certificate. Ask a qualified Hafiz to inspect reported differences before changing any Quran text.
- Font: KFGQPC Uthmanic Hafs (King Fahd Complex). Its licence allows use and distribution without modification; read it
  before publishing.
- Page layout: the existing 604-page row-length data from the open `zonetecde/mushaf-layout` data set (built from Quran.com) is preserved. Automated navigation checks walk every bundled Quran word in order and ensure no page has more than 15 rows. A comparison with the pinned King Fahd Complex Uthmanic Hafs v2.0 page/line metadata reports 56 Ayah page and 1,499 Ayah line-coordinate differences; the layout dataset's exact printed edition is not recorded, so this reconstruction is not publisher-exact. The reader does not alter the page boundaries to hide those differences.
- Translations: Maududi and Jalandhry (Urdu), Saheeh International (English), all via Tanzil.net. Check Tanzil's terms
  for each before commercial use.

## Publishing on Android

The app is a PWA, so the usual route to the Play Store is a Trusted Web Activity:

1. Deploy to HTTPS (Vercel works with no changes).
2. Generate the Android project with Bubblewrap or pwabuilder.com from your site's manifest.
3. Host the `assetlinks.json` it gives you at `/.well-known/assetlinks.json` (put it in `public/.well-known/`).
4. Upload the signed bundle in the Play Console.

Replace the placeholder icons in `public/icons/` first.

### Build a debug APK for device testing

On Windows with Android SDK platform 36 installed, run:

```powershell
npm run build:android
```

The script exports the Next.js app into the native WebView wrapper and creates
`android/app/build/outputs/apk/debug/app-debug.apk`. Copy that APK to an Android
phone and open it to install. This is a debug-signed test build, not a Play Store release.

## Layout

```
src/app/            pages: home, mushaf, recite, memorize, profile, login
src/components/     Shell (navigation, theme, auth), Audio, AyahSheet, SearchDialog, Practice
src/lib/            quran (data access, search), store (state), hifz (scheduling), goals, supabase (auth + sync)
public/data/        Quran text, page layout, translations, tafsir
supabase/schema.sql tables and row level security
```
