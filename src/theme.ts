/**
 * DESIGN SYSTEM — Dark Sports Theme
 * Jedno miejsce, w którym trzymamy kolory, odstępy i zaokrąglenia.
 * Nigdy nie wpisuj kolorów "z palca" w ekranach — zawsze bierz je stąd.
 */

export const colors = {
  background: "#0F172A", // Slate 900 — tło ekranu
  surface: "#1E293B", // Slate 800 — karty, pola
  surfaceAlt: "#172033", // ciemniejszy wariant karty
  border: "#334155", // Slate 700 — obramowania
  primary: "#10B981", // Emerald 500 — akcent, akcje pozytywne
  primaryDark: "#059669",
  text: "#F8FAFC", // Slate 50 — tekst główny
  textMuted: "#94A3B8", // Slate 400 — tekst pomocniczy
  danger: "#EF4444", // Red 500 — odrzucenie, błąd
  warning: "#F59E0B", // Amber 500 — ostrzeżenie
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  huge: 34,
} as const;

/** Poziomy zaawansowania 1–4 w wersji czytelnej dla człowieka. */
export const SKILL_LABELS: Record<number, string> = {
  1: "Początkujący",
  2: "Średni",
  3: "Zaawansowany",
  4: "Turniejowy",
};

/** Lista dyscyplin obsługiwanych przez aplikację (pastylki na ekranie "Znajdź"). */
export const SPORTS = [
  { key: "tennis", label: "Tenis", emoji: "🎾" },
  { key: "padel", label: "Padel", emoji: "🏸" },
  { key: "running", label: "Bieganie", emoji: "🏃" },
  { key: "climbing", label: "Wspinaczka", emoji: "🧗" },
  { key: "gym", label: "Siłownia", emoji: "🏋️" },
] as const;

export type SportKey = (typeof SPORTS)[number]["key"];
