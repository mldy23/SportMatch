/**
 * CZAS I SLOTY
 *
 * PostgreSQL przechowuje termin rezerwacji w kolumnie typu `tstzrange`,
 * a przez API dostajemy go jako TEKST, np.:
 *   ["2026-09-18 08:00:00+00","2026-09-18 09:30:00+00")
 * Ten plik zamienia taki tekst na daty JavaScriptu i odwrotnie,
 * oraz generuje siatkę godzin otwarcia obiektu.
 */

/** Godzina otwarcia obiektu (8:00). */
export const OPEN_HOUR = 8;
/** Godzina zamknięcia obiektu (22:00). */
export const CLOSE_HOUR = 22;
/** Długość jednego slotu w minutach. */
export const SLOT_MINUTES = 90;

export type Slot = {
  start: Date;
  end: Date;
  /** Klucz techniczny, np. "2026-09-18T08:00" — wygodny dla React `key`. */
  key: string;
  /** Etykieta dla użytkownika, np. "08:00 – 09:30". */
  label: string;
};

/** Zwraca kopię daty ustawioną na początek dnia (00:00 czasu lokalnego). */
export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Lista kolejnych `count` dni, począwszy od dzisiaj. */
export function nextDays(count: number): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() + index);
    return day;
  });
}

/** Wszystkie sloty w wybranym dniu (08:00–22:00, co 90 minut). */
export function buildDaySlots(day: Date): Slot[] {
  const slots: Slot[] = [];
  const cursor = startOfDay(day);
  cursor.setHours(OPEN_HOUR, 0, 0, 0);

  const closing = startOfDay(day);
  closing.setHours(CLOSE_HOUR, 0, 0, 0);

  while (cursor.getTime() + SLOT_MINUTES * 60_000 <= closing.getTime()) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + SLOT_MINUTES * 60_000);
    slots.push({
      start,
      end,
      key: `${toDateKey(start)}T${formatTime(start)}`,
      label: `${formatTime(start)} – ${formatTime(end)}`,
    });
    cursor.setTime(cursor.getTime() + SLOT_MINUTES * 60_000);
  }

  return slots;
}

/** "08:00" — godzina i minuta w czasie lokalnym telefonu. */
export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "2026-09-18" — klucz dnia niezależny od strefy czasowej wyświetlania. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

const WEEKDAYS = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
const MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

/** { weekday: "pt", day: "18" } — dane dla kafelka wyboru dnia. */
export function describeDay(date: Date): { weekday: string; day: string } {
  return {
    weekday: WEEKDAYS[date.getDay()],
    day: String(date.getDate()),
  };
}

/** "18 września, 08:00 – 09:30" — pełny opis terminu na bilecie. */
export function formatSlotLong(start: Date, end: Date): string {
  return `${start.getDate()} ${MONTHS[start.getMonth()]}, ${formatTime(start)} – ${formatTime(end)}`;
}

/** "dzisiaj", "wczoraj", "12.09" — nagłówek daty na liście czatu. */
export function formatRelativeDay(date: Date): string {
  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(date).getTime();
  const diffDays = Math.round((today - target) / 86_400_000);
  if (diffDays === 0) return "dzisiaj";
  if (diffDays === 1) return "wczoraj";
  if (diffDays === -1) return "jutro";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Buduje tekst zakresu, który rozumie PostgreSQL.
 * Nawias kwadratowy = początek włącznie, zwykły = koniec wyłącznie,
 * dzięki czemu slot 09:30 nie koliduje ze slotem kończącym się o 09:30.
 */
export function toTstzRange(start: Date, end: Date): string {
  return `["${start.toISOString()}","${end.toISOString()}")`;
}

/** Zamienia tekst z bazy na parę dat. Zwraca null, gdy formatu nie da się odczytać. */
export function parseTstzRange(
  raw: string | null | undefined,
): { start: Date; end: Date } | null {
  if (!raw) return null;
  const inner = raw.slice(1, -1); // ucinamy nawiasy [ ) z obu stron
  const parts = inner.split(",");
  if (parts.length < 2) return null;

  const start = parseTimestamp(parts[0]);
  const end = parseTimestamp(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

function parseTimestamp(value: string): Date | null {
  let text = value.trim().replace(/^"|"$/g, "");
  if (!text) return null;

  // "2026-09-18 08:00:00+00" -> "2026-09-18T08:00:00+00:00"
  text = text.replace(" ", "T");
  // mikrosekundy -> milisekundy (JavaScript rozumie maksymalnie 3 cyfry)
  text = text.replace(/\.(\d{3})\d+/, ".$1");
  // strefa "+00" -> "+00:00", "+0200" -> "+02:00"
  text = text.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  text = text.replace(/([+-]\d{2})$/, "$1:00");

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Czy dwa przedziały czasowe na siebie nachodzą? */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Ile minut zostało do podanego momentu (liczba ujemna = już minął). */
export function minutesUntil(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 60_000);
}

/**
 * Godziny do umówienia spotkania na obiekcie otwartym.
 * Nie ma tu żadnej siatki zajętości — park jest dla wszystkich, więc
 * pokazujemy po prostu pełne i połówkowe godziny od 6:00 do 21:30.
 */
export function buildMeetupTimes(day: Date, durationMinutes = 90): Slot[] {
  const times: Slot[] = [];
  const cursor = startOfDay(day);
  cursor.setHours(6, 0, 0, 0);

  const last = startOfDay(day);
  last.setHours(21, 30, 0, 0);

  while (cursor.getTime() <= last.getTime()) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + durationMinutes * 60_000);
    times.push({
      start,
      end,
      key: `${toDateKey(start)}T${formatTime(start)}`,
      label: formatTime(start),
    });
    cursor.setTime(cursor.getTime() + 30 * 60_000);
  }

  return times;
}

/** Formatuje kod rezerwacji: "482195" -> "482-195". */
export function formatBookingCode(code: string): string {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** "90,00 zł" — cena slotu policzona z godzinowej stawki kortu. */
export function slotPrice(hourlyRate: number): string {
  const price = (hourlyRate * SLOT_MINUTES) / 60;
  return `${price.toFixed(2).replace(".", ",")} zł`;
}
