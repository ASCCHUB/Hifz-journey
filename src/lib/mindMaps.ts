// Curated lesson boundaries and visual memory cues. Arabic and translations are
// always loaded from the bundled Quran datasets; these labels are not Tafsir.
export type MindMapNode = { ayah: number; cue: string; symbol: string; color: string };
export type MindMapGroup = { title: string; ayahs: number[]; color: string; symbol: string; motif: "spark" | "scale" | "compass" | "book" | "rain" | "flame" | "garden" | "link" | "sky"; quadrant: "ne" | "nw" | "sw" | "se" };
export type MindMapLesson = {
  id: string;
  surah: number;
  from: number;
  to: number;
  title: string;
  subtitle: string;
  emblem: string;
  nodes: MindMapNode[];
  groups: MindMapGroup[];
};

export const MIND_MAPS: MindMapLesson[] = [
  {
    id: "al-fatihah",
    surah: 1,
    from: 1,
    to: 7,
    title: "Surah Al-Fatihah",
    subtitle: "Praise · worship · the straight path",
    emblem: "✺",
    nodes: [
      { ayah: 1, cue: "Beginning in Allah’s name", symbol: "☾", color: "#c99438" },
      { ayah: 2, cue: "Praise · Lord of all worlds", symbol: "✿", color: "#2f927b" },
      { ayah: 3, cue: "The Entirely Merciful", symbol: "☼", color: "#d27c52" },
      { ayah: 4, cue: "Day of Recompense", symbol: "⚖", color: "#8a71b5" },
      { ayah: 5, cue: "Worship · seek help", symbol: "⌁", color: "#3887a5" },
      { ayah: 6, cue: "Guide us to the straight path", symbol: "➜", color: "#4e9b62" },
      { ayah: 7, cue: "The favored path · those astray", symbol: "✧", color: "#bf6a81" },
    ],
    groups: [
      { title: "Praise · mercy · recompense", ayahs: [1, 2, 3, 4], color: "#62b985", symbol: "✦", motif: "spark", quadrant: "ne" },
      { title: "Worship · help · guidance", ayahs: [5, 6], color: "#eed900", symbol: "⌁", motif: "compass", quadrant: "nw" },
      { title: "The favored path · those astray", ayahs: [7], color: "#f29a00", symbol: "➜", motif: "scale", quadrant: "sw" },
    ],
  },
  {
    id: "al-baqarah-1-5",
    surah: 2,
    from: 1,
    to: 5,
    title: "Al-Baqarah · 1–5",
    subtitle: "The Book · guidance · qualities of the successful",
    emblem: "▤",
    nodes: [
      { ayah: 1, cue: "Alif · Lam · Meem", symbol: "ا", color: "#c99438" },
      { ayah: 2, cue: "The Book · guidance", symbol: "▤", color: "#2f927b" },
      { ayah: 3, cue: "Unseen · prayer · provision", symbol: "☼", color: "#3887a5" },
      { ayah: 4, cue: "Revelation · certainty in the Hereafter", symbol: "✧", color: "#8a71b5" },
      { ayah: 5, cue: "Guidance · successful", symbol: "➜", color: "#4e9b62" },
    ],
    groups: [
      { title: "Opening letters · the Book", ayahs: [1, 2], color: "#62b985", symbol: "▤", motif: "book", quadrant: "ne" },
      { title: "Faith · prayer · revelation", ayahs: [3, 4], color: "#eed900", symbol: "☼", motif: "rain", quadrant: "nw" },
      { title: "Guidance · success", ayahs: [5], color: "#f29a00", symbol: "➜", motif: "compass", quadrant: "sw" },
    ],
  },
  {
    id: "al-baqarah-21-29",
    surah: 2,
    from: 21,
    to: 29,
    title: "Al-Baqarah · 21–29",
    subtitle: "Worship · signs of creation · resurrection",
    emblem: "❋",
    nodes: [
      { ayah: 21, cue: "Worship your Lord", symbol: "⌂", color: "#c99438" },
      { ayah: 22, cue: "Earth · sky · rain · provision", symbol: "☁", color: "#3887a5" },
      { ayah: 23, cue: "The challenge · bring a surah", symbol: "▤", color: "#8a71b5" },
      { ayah: 24, cue: "The warning of the Fire", symbol: "♨", color: "#c45c42" },
      { ayah: 25, cue: "Good news · gardens · rivers", symbol: "❀", color: "#4e9b62" },
      { ayah: 26, cue: "The example of a mosquito", symbol: "⟡", color: "#bf6a81" },
      { ayah: 27, cue: "Covenant · ties · corruption", symbol: "⛓", color: "#b7793f" },
      { ayah: 28, cue: "Life · death · return", symbol: "↻", color: "#2f927b" },
      { ayah: 29, cue: "The earth · seven heavens", symbol: "✦", color: "#6574b7" },
    ],
    groups: [
      { title: "Worship · earth · sky · provision", ayahs: [21, 22], color: "#62b985", symbol: "☁", motif: "rain", quadrant: "ne" },
      { title: "The challenge · the warning", ayahs: [23, 24], color: "#eed900", symbol: "♨", motif: "flame", quadrant: "nw" },
      { title: "Good news · the example", ayahs: [25, 26], color: "#f29a00", symbol: "❀", motif: "garden", quadrant: "se" },
      { title: "Covenant · return · heavens", ayahs: [27, 28, 29], color: "#56a6c1", symbol: "✧", motif: "link", quadrant: "sw" },
    ],
  },
];

export const mapAyahs = (map: MindMapLesson): [number, number][] =>
  Array.from({ length: map.to - map.from + 1 }, (_, i) => [map.surah, map.from + i]);
