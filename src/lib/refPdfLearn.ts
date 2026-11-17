import { juzOf } from "./quran";
import { REFERENCE_JUZ } from "./refPdfs";

/** Match from the current Ayah, never from its containing Mushaf page. */
export function referenceJuzForAyah(s: number, a: number, importedJuz: readonly number[], resolveJuz = juzOf): number | null {
  const juz = resolveJuz(s, a);
  return REFERENCE_JUZ.some((entry) => entry.juz === juz) && importedJuz.includes(juz) ? juz : null;
}

export function referenceMapHref(juz: number, returnTo: string): string {
  return `/reference-map?juz=${juz}&returnTo=${encodeURIComponent(returnTo)}`;
}
