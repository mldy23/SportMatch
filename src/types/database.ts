/**
 * TYPY DANYCH — lustrzane odbicie tabel z Supabase.
 *
 * Trzymamy je ręcznie, żeby projekt działał bez dodatkowych narzędzi.
 * Gdy będziesz gotowy, możesz wygenerować je automatycznie:
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <TWOJE_ID> > src/types/database.ts
 */

export type UserRole = "USER" | "VENUE_ADMIN";
export type BookingType = "PUBLIC" | "IN_APP" | "EXTERNAL_CONTACT";
export type BookingStatus =
  | "CONFIRMED"
  | "CHECKED_IN"
  | "NO_SHOW"
  | "CANCELLED";
export type SwipeAction = "LIKE" | "PASS";

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  lat: number | null;
  lng: number | null;
  max_distance_km: number;
  reliability_score: number;
  strikes_count: number;
  cooldown_until: string | null;
  onboarded: boolean;
  created_at: string;
};

export type UserSport = {
  id: string;
  user_id: string;
  sport: string;
  skill_level: number;
  play_style: string | null;
};

export type Venue = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  booking_type: BookingType;
  phone_number: string | null;
  image_url: string | null;
  admin_id: string | null;
};

export type Court = {
  id: string;
  venue_id: string;
  name: string;
  hourly_rate: number;
};

export type Booking = {
  id: string;
  court_id: string;
  user_id: string;
  partner_id: string | null;
  /** Zakres w formacie PostgreSQL tstzrange, np. ["2026-09-18 08:00:00+00","2026-09-18 09:30:00+00") */
  time_slot: string;
  booking_code: string;
  status: BookingStatus;
  booking_source: string;
  reception_notes: string | null;
  /** true = umówione spotkanie na obiekcie otwartym (nie blokuje terminu nikomu) */
  is_meetup: boolean;
  user_checked_in: boolean;
  partner_checked_in: boolean;
  created_at: string;
};

/**
 * Wiersz z publicznego grafiku zajętości (tabela court_slots).
 * Zawiera wyłącznie informację „ten kort jest zajęty w tych godzinach” —
 * bez kodów, notatek i danych osobowych. Dzięki temu każdy zalogowany
 * użytkownik może zobaczyć wolne terminy, nie widząc cudzych rezerwacji.
 */
export type CourtSlot = {
  booking_id: string;
  court_id: string;
  time_slot: string;
  status: BookingStatus;
};

export type Match = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

/** Wiersz zwracany przez funkcję RPC get_match_candidates. */
export type Candidate = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  skill_level: number;
  play_style: string | null;
  reliability_score: number;
  distance_m: number | null;
};

/** Rezerwacja z dociągniętymi danymi kortu, obiektu i partnera (ekran "Bilety"). */
export type BookingWithDetails = Booking & {
  courts: {
    name: string;
    hourly_rate: number;
    venues: {
      name: string;
      address: string;
      lat: number;
      lng: number;
      booking_type: BookingType;
      phone_number: string | null;
    } | null;
  } | null;
  partner: { full_name: string } | null;
  owner: { full_name: string } | null;
};

/** Wątek na liście wiadomości. */
export type MatchThread = {
  matchId: string;
  partner: Pick<Profile, "id" | "full_name" | "avatar_url">;
  lastMessage: string | null;
  lastMessageAt: string | null;
};

/**
 * POMOCNIKI DO RZUTOWANIA WYNIKÓW ZAPYTAŃ
 *
 * Gdy klient Supabase nie zna schematu bazy (nie generowaliśmy typów),
 * przy zapytaniach z relacjami — np. `select('*, courts(name)')` — biblioteka
 * nie wie, czy `courts` to jeden wiersz, czy tablica. Zamiast walczyć
 * z TypeScriptem w każdym ekranie, przepuszczamy dane przez te dwie funkcje
 * i sami deklarujemy oczekiwany kształt (mamy go w typach powyżej).
 */
export function asRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export function asRow<T>(data: unknown): T | null {
  return (data ?? null) as T | null;
}
