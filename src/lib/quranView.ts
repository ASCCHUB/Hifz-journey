// Small display helpers shared by the assessment screens (thin wrappers over lib/quran).
import { pageAyahs } from "./chunking";
import { arNum, juzOf as juzOfAyah, ref, sname, text } from "./quran";

export { arNum, ref, sname, text };
/** Juz of a Mushaf page (by its first Ayah). */
export const juzOf = (page: number) => { const [s, a] = pageAyahs(page)[0]; return juzOfAyah(s, a); };
/** Plain Surah and page summary for library rows. */
export const surahPageLabel = (name: string, ayahs: number, firstPage: number, lastPage: number) => `${name} | ${ayahs} Ayahs | ${firstPage === lastPage ? `Page ${firstPage}` : `Pages ${firstPage}-${lastPage}`}`;
export const juzName = (juz: number) => `Juz ${juz}`;
/** "Al-Baqarah 6" - where a page begins. */
export const pageAyahsStart = (page: number) => { const [s, a] = pageAyahs(page)[0]; return `${sname(s)} ${a}`; };
