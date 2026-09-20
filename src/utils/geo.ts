/**
 * GEOLOKALIZACJA — formuła Haversine.
 * Liczy odległość po powierzchni kuli ziemskiej między dwoma punktami.
 * Używana przy self check-inie (promień 150 m) i przy filtrowaniu kandydatów.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // promień Ziemi w metrach
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // wynik w metrach
}

/** Maksymalna odległość od obiektu, przy której wolno się odprawić. */
export const CHECK_IN_RADIUS_M = 150;

/** "850 m" albo "4,2 km" — ładny opis odległości dla użytkownika. */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return "brak danych";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
