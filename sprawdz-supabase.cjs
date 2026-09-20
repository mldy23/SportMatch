/**
 * NARZĘDZIE DIAGNOSTYCZNE POŁĄCZENIA Z SUPABASE
 *
 * Uruchom z katalogu projektu:   node sprawdz-supabase.cjs
 *
 * Sprawdza po kolei:
 *   1. czy plik .env istnieje i ma poprawnie zapisane obie zmienne,
 *   2. czy adres projektu nie ma nadmiarowej ścieżki (najczęstsza przyczyna
 *      błędu „Invalid path specified in request URL”),
 *   3. czy serwer logowania (Auth) odpowiada,
 *   4. czy rejestracja e-mailem jest włączona i czy wymaga potwierdzenia,
 *   5. czy baza ma wgrany schemat z rozdziału 03.
 *
 * Skrypt niczego nie zmienia — tylko czyta.
 */

const fs = require("fs");
const path = require("path");

const ZIELONY = "\x1b[32m";
const CZERWONY = "\x1b[31m";
const ZOLTY = "\x1b[33m";
const SZARY = "\x1b[90m";
const KONIEC = "\x1b[0m";

const ok = (t) => console.log(`${ZIELONY}  ✓${KONIEC} ${t}`);
const blad = (t) => console.log(`${CZERWONY}  ✗ ${t}${KONIEC}`);
const uwaga = (t) => console.log(`${ZOLTY}  ! ${t}${KONIEC}`);
const info = (t) => console.log(`${SZARY}    ${t}${KONIEC}`);

function naglowek(t) {
  console.log(`\n${t}`);
  console.log("─".repeat(Math.max(t.length, 40)));
}

/** Prosty czytnik pliku .env (bez dodatkowych bibliotek). */
function czytajEnv(plik) {
  if (!fs.existsSync(plik)) return null;
  const wynik = {};
  for (const linia of fs.readFileSync(plik, "utf8").split("\n")) {
    const tekst = linia.trim();
    if (!tekst || tekst.startsWith("#")) continue;
    const podzial = tekst.indexOf("=");
    if (podzial === -1) continue;
    const nazwa = tekst.slice(0, podzial).trim();
    const wartosc = tekst
      .slice(podzial + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    wynik[nazwa] = wartosc;
  }
  return wynik;
}

async function zapytaj(adres, klucz, sciezka) {
  const start = Date.now();
  try {
    const odpowiedz = await fetch(`${adres}${sciezka}`, {
      headers: { apikey: klucz, Authorization: `Bearer ${klucz}` },
      signal: AbortSignal.timeout(15000),
    });
    const tekst = await odpowiedz.text();
    return { status: odpowiedz.status, tekst, ms: Date.now() - start };
  } catch (e) {
    return { status: 0, tekst: e.message, ms: Date.now() - start };
  }
}

(async () => {
  console.log("\n=============================================");
  console.log("  DIAGNOSTYKA POŁĄCZENIA SPORTMATCH ↔ SUPABASE");
  console.log("=============================================");

  // ---------------------------------------------------------------- KROK 1
  naglowek("KROK 1/5 — plik .env");

  // Skrypt uruchamiamy z katalogu projektu, więc szukamy .env tutaj.
  const sciezkaEnv = path.join(process.cwd(), ".env");
  const env = czytajEnv(sciezkaEnv);

  if (!env) {
    blad("Nie znaleziono pliku .env w katalogu projektu.");
    info(`Oczekiwana lokalizacja: ${sciezkaEnv}`);
    info(
      "Utwórz go zgodnie z punktem 3.7 instrukcji i uruchom skrypt ponownie.",
    );
    process.exit(1);
  }
  ok("Plik .env istnieje.");

  const surowyAdres = env.EXPO_PUBLIC_SUPABASE_URL;
  const surowyKlucz = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!surowyAdres) {
    blad("Brak zmiennej EXPO_PUBLIC_SUPABASE_URL.");
    info(`Znalezione zmienne: ${Object.keys(env).join(", ") || "(żadne)"}`);
    info(
      "Uwaga: nazwa musi zaczynać się od EXPO_PUBLIC_ — inaczej Expo jej nie wczyta.",
    );
    process.exit(1);
  }
  if (!surowyKlucz) {
    blad("Brak zmiennej EXPO_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(1);
  }
  ok("Obie zmienne są obecne.");

  // ---------------------------------------------------------------- KROK 2
  naglowek("KROK 2/5 — poprawność adresu projektu");

  info(`Wpis w .env: ${surowyAdres}`);

  if (
    surowyAdres.includes("TWOJ-PROJEKT") ||
    surowyAdres.includes("twojprojekt")
  ) {
    blad("To wciąż przykładowy adres z instrukcji — wklej własny.");
    info("Supabase → Project Settings → Data API → pole „Project URL”.");
    process.exit(1);
  }

  let adres;
  try {
    adres = new URL(surowyAdres.replace(/\/+$/, ""));
  } catch {
    blad("Adres nie jest poprawnym adresem URL.");
    info("Poprawny format: https://abcdefgh.supabase.co");
    process.exit(1);
  }

  let doNaprawy = false;

  if (
    adres.hostname === "supabase.com" ||
    adres.hostname === "app.supabase.com"
  ) {
    blad("To adres panelu Supabase z przeglądarki, a nie adres projektu.");
    info("Potrzebujesz adresu w formacie https://<identyfikator>.supabase.co");
    doNaprawy = true;
  } else if (adres.pathname !== "/" && adres.pathname !== "") {
    blad(`Adres ma nadmiarową ścieżkę: „${adres.pathname}”`);
    console.log(
      `${CZERWONY}    ⇒ TO JEST PRZYCZYNA BŁĘDU „Invalid path specified in request URL”.${KONIEC}`,
    );
    info(
      `Aplikacja wysyła zapytanie na: ${adres.origin}${adres.pathname}/auth/v1/signup`,
    );
    info(`A powinna na:                  ${adres.origin}/auth/v1/signup`);
    console.log(
      `\n${ZIELONY}    NAPRAW TAK — w pliku .env zostaw wyłącznie:${KONIEC}`,
    );
    console.log(`    EXPO_PUBLIC_SUPABASE_URL=${adres.origin}`);
    info("Potem: Ctrl + C w terminalu i ponownie npx expo start -c");
    doNaprawy = true;
  } else if (!adres.hostname.endsWith(".supabase.co")) {
    uwaga(
      `Nietypowa domena: ${adres.hostname} (to w porządku, jeśli używasz własnej domeny).`,
    );
  } else {
    ok(`Adres poprawny: ${adres.origin}`);
  }

  if (surowyKlucz.startsWith("http")) {
    blad("W zmiennej z kluczem jest adres — wartości są zamienione miejscami.");
    doNaprawy = true;
  } else if (
    surowyKlucz.startsWith("eyJ") &&
    surowyKlucz.split(".").length !== 3
  ) {
    blad("Klucz anon jest ucięty — skopiuj go ponownie w całości.");
    doNaprawy = true;
  } else {
    ok(
      `Klucz wygląda poprawnie (${surowyKlucz.length} znaków, początek: ${surowyKlucz.slice(0, 6)}…).`,
    );
  }

  if (doNaprawy) {
    console.log(
      `\n${CZERWONY}Popraw powyższe i uruchom skrypt ponownie.${KONIEC}\n`,
    );
    process.exit(1);
  }

  const bazowy = adres.origin;

  // ---------------------------------------------------------------- KROK 3
  naglowek("KROK 3/5 — czy serwer logowania odpowiada");

  const zdrowie = await zapytaj(bazowy, surowyKlucz, "/auth/v1/health");

  if (zdrowie.status === 0) {
    blad(`Brak połączenia z serwerem: ${zdrowie.tekst}`);
    info(
      "Sprawdź internet oraz czy projekt w Supabase nie jest wstrzymany (paused).",
    );
    process.exit(1);
  }
  if (zdrowie.status === 200) {
    ok(`Serwer logowania odpowiada (${zdrowie.ms} ms).`);
    info(zdrowie.tekst.slice(0, 160));
  } else {
    blad(`Serwer zwrócił status ${zdrowie.status}.`);
    info(zdrowie.tekst.slice(0, 300));
    if (zdrowie.tekst.includes("Invalid path")) {
      info(
        "Ten komunikat oznacza zły adres projektu — porównaj go z panelem Supabase.",
      );
    }
    if (zdrowie.status === 401) {
      info(
        "Status 401 = nieprawidłowy klucz anon. Skopiuj go ponownie z Project Settings → API Keys.",
      );
    }
    process.exit(1);
  }

  // ---------------------------------------------------------------- KROK 4
  naglowek("KROK 4/5 — ustawienia rejestracji");

  const ustawienia = await zapytaj(bazowy, surowyKlucz, "/auth/v1/settings");
  if (ustawienia.status === 200) {
    let dane = {};
    try {
      dane = JSON.parse(ustawienia.tekst);
    } catch {
      /* nieistotne */
    }

    if (dane.disable_signup === true) {
      blad("Rejestracja nowych kont jest WYŁĄCZONA w projekcie.");
      info(
        "Supabase → Authentication → Sign In / Providers → włącz „Allow new users to sign up”.",
      );
    } else {
      ok("Rejestracja nowych kont jest włączona.");
    }

    if (dane.external && dane.external.email === false) {
      blad("Logowanie e-mailem jest wyłączone.");
      info("Supabase → Authentication → Sign In / Providers → Email → włącz.");
    } else {
      ok("Logowanie e-mailem jest włączone.");
    }

    if (dane.mailer_autoconfirm === true) {
      ok(
        "Potwierdzanie e-maila wyłączone — po rejestracji od razu jesteś zalogowany (tak ma być na czas nauki).",
      );
    } else {
      uwaga(
        "Potwierdzanie e-maila jest WŁĄCZONE — po rejestracji trzeba kliknąć link z wiadomości.",
      );
      info(
        "Na czas nauki wyłącz je: Authentication → Sign In / Providers → Email → odznacz „Confirm email” (punkt 3.2).",
      );
    }
  } else {
    uwaga(
      `Nie udało się odczytać ustawień (status ${ustawienia.status}) — pomijam ten krok.`,
    );
  }

  // ---------------------------------------------------------------- KROK 5
  naglowek("KROK 5/5 — czy baza ma wgrany schemat");

  const tabele = [
    "profiles",
    "user_sports",
    "venues",
    "courts",
    "bookings",
    "swipes",
    "matches",
    "messages",
  ];
  let brakujace = 0;

  for (const tabela of tabele) {
    const wynik = await zapytaj(
      bazowy,
      surowyKlucz,
      `/rest/v1/${tabela}?select=*&limit=1`,
    );
    if (wynik.status === 200) {
      ok(`tabela ${tabela} — dostępna`);
    } else if (wynik.status === 404 || wynik.tekst.includes("does not exist")) {
      blad(`tabela ${tabela} — NIE ISTNIEJE`);
      brakujace += 1;
    } else {
      uwaga(
        `tabela ${tabela} — status ${wynik.status}: ${wynik.tekst.slice(0, 90)}`,
      );
    }
  }

  const funkcja = await zapytaj(
    bazowy,
    surowyKlucz,
    "/rest/v1/rpc/get_match_candidates?p_sport=tennis",
  );
  if (funkcja.status === 404) {
    blad(
      "funkcja get_match_candidates — NIE ISTNIEJE (potrzebna w rozdziale 06)",
    );
    brakujace += 1;
  } else {
    ok("funkcja get_match_candidates — dostępna");
  }

  // ---------------------------------------------------------------- PODSUMOWANIE
  naglowek("PODSUMOWANIE");

  if (brakujace > 0) {
    blad(
      `Brakuje ${brakujace} elementów schematu — uruchom ponownie supabase/01_schema.sql.`,
    );
  } else {
    ok("Konfiguracja i baza wyglądają poprawnie.");
    info(
      "Jeśli rejestracja nadal nie działa, zapisz komunikat błędu z telefonu — problem jest",
    );
    info("wtedy po stronie aplikacji, a nie połączenia.");
  }
  console.log("");
})();
