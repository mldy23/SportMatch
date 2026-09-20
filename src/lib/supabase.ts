import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

/**
 * KLIENT SUPABASE — jedyne miejsce, w którym łączymy się z bazą.
 *
 * Adres i klucz czytamy ze zmiennych środowiskowych z pliku .env.
 * Prefiks EXPO_PUBLIC_ jest obowiązkowy — bez niego Expo nie wstrzyknie
 * zmiennej do aplikacji.
 *
 * WAŻNE: zmienne muszą być odczytane DOSŁOWNIE, jako `process.env.NAZWA`.
 * Expo podmienia takie zapisy na konkretne wartości w trakcie budowania.
 * Zapis dynamiczny (`process.env[nazwa]`) zwróci `undefined`.
 */
const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const PORADA_RESTART =
  "Po każdej zmianie pliku .env zatrzymaj serwer (Ctrl + C) i uruchom ponownie: npx expo start -c";

/**
 * Sprawdza i porządkuje adres projektu.
 *
 * Najczęstsza pomyłka: skopiowanie adresu z dodatkową ścieżką (np. kończącego
 * się na /rest/v1) albo adresu panelu z przeglądarki. Biblioteka doklei wtedy
 * do niego /auth/v1/signup i serwer Supabase odpowie komunikatem
 * „Invalid path specified in request URL”. Wyłapujemy to tutaj, zanim
 * dojdzie do zapytania — z czytelnym wyjaśnieniem, co poprawić.
 */
function sprawdzAdres(wartosc: string | undefined): string {
  const podpowiedz =
    "Poprawny format: https://twojprojekt.supabase.co (bez żadnej ścieżki na końcu)";

  if (!wartosc || wartosc.trim().length === 0) {
    throw new Error(
      `Brak adresu Supabase.\nDodaj do pliku .env linię:\nEXPO_PUBLIC_SUPABASE_URL=https://twojprojekt.supabase.co\n${PORADA_RESTART}`,
    );
  }

  // Usuwamy przypadkowe cudzysłowy, spacje i ukośniki na końcu.
  const adres = wartosc
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "");

  if (adres.includes("twojprojekt") || adres.includes("TWOJ-PROJEKT")) {
    throw new Error(
      `W pliku .env został przykładowy adres z instrukcji.\nWklej własny: Supabase → Project Settings → Data API → Project URL.\n${podpowiedz}`,
    );
  }

  if (adres.startsWith("eyJ") || adres.startsWith("sb_")) {
    throw new Error(
      `Pomyliły się wartości w .env: w EXPO_PUBLIC_SUPABASE_URL jest klucz, a nie adres.\n${podpowiedz}`,
    );
  }

  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    throw new Error(
      `Adres Supabase jest nieprawidłowy: „${adres}”.\n${podpowiedz}`,
    );
  }

  if (url.hostname === "supabase.com" || url.hostname === "app.supabase.com") {
    throw new Error(
      `To adres panelu Supabase z przeglądarki, nie adres projektu.\n` +
        `Wejdź w Project Settings → Data API i skopiuj „Project URL”.\n${podpowiedz}`,
    );
  }

  // Tu jest sedno błędu „Invalid path specified in request URL”.
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      `Adres Supabase ma nadmiarową ścieżkę: „${url.pathname}”.\n` +
        `To właśnie powoduje błąd „Invalid path specified in request URL” — biblioteka dokleja ` +
        `/auth/v1/signup na końcu i powstaje adres, którego serwer nie rozpoznaje.\n` +
        `Zostaw wyłącznie adres domeny: ${url.origin}\n${PORADA_RESTART}`,
    );
  }

  if (
    url.protocol !== "https:" &&
    !/^(localhost|127\.|10\.|192\.168\.)/.test(url.hostname)
  ) {
    throw new Error(
      `Adres Supabase musi zaczynać się od https://\n${podpowiedz}`,
    );
  }

  return url.origin;
}

/** Sprawdza klucz publiczny (anon). */
function sprawdzKlucz(wartosc: string | undefined): string {
  if (!wartosc || wartosc.trim().length === 0) {
    throw new Error(
      `Brak klucza Supabase.\nDodaj do pliku .env linię:\nEXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...\n${PORADA_RESTART}`,
    );
  }

  const klucz = wartosc.trim().replace(/^["']|["']$/g, "");

  if (klucz.startsWith("http")) {
    throw new Error(
      "Pomyliły się wartości w .env: w EXPO_PUBLIC_SUPABASE_ANON_KEY jest adres, a nie klucz.",
    );
  }

  if (klucz.includes("wklej") || klucz.includes("tutaj")) {
    throw new Error(
      `W pliku .env został przykładowy klucz z instrukcji.\nWklej własny: Supabase → Project Settings → API Keys → klucz „anon”.\n${PORADA_RESTART}`,
    );
  }

  if (klucz.startsWith("eyJ") && klucz.split(".").length !== 3) {
    throw new Error(
      "Klucz anon wygląda na ucięty (zabrakło fragmentu po kropce). Skopiuj go ponownie w całości.",
    );
  }

  return klucz;
}

export const supabaseUrl = sprawdzAdres(rawUrl);
export const supabaseAnonKey = sprawdzKlucz(rawAnonKey);

// W trybie deweloperskim wypisujemy adres, z którym faktycznie się łączymy.
// Bardzo pomaga, gdy aplikacja „uparcie” używa starych danych z .env.
if (process.env.NODE_ENV !== "production") {
  console.log(`[supabase] Łączę się z: ${supabaseUrl}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Sesja przechowywana w pamięci telefonu — po zamknięciu aplikacji
    // użytkownik nadal jest zalogowany.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Na telefonie nie ma adresu URL przeglądarki, więc wyłączamy wykrywanie.
    detectSessionInUrl: false,
  },
});

/**
 * Odświeżanie tokenu tylko wtedy, gdy aplikacja jest na pierwszym planie.
 * Zalecane przez dokumentację Supabase dla React Native.
 */
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

/** Kod błędu PostgreSQL dla naruszenia więzu EXCLUDE (nakładające się terminy). */
export const PG_EXCLUSION_VIOLATION = "23P01";
/** Kod błędu dla naruszenia unikalności (np. podwójny swipe). */
export const PG_UNIQUE_VIOLATION = "23505";
