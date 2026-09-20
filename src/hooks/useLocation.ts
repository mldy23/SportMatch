import * as Location from "expo-location";
import { useCallback, useState } from "react";

/**
 * GEOLOKALIZACJA NA ŻĄDANIE
 *
 * Nie pobieramy pozycji w tle — prosimy o nią tylko wtedy, gdy użytkownik
 * czegoś od nas chce (zapis profilu, odprawa na obiekcie). Tak wypada lepiej
 * pod kątem prywatności i baterii.
 */
export type Coords = { lat: number; lng: number };

export function useLocation() {
  const [busy, setBusy] = useState(false);

  const getCoords = useCallback(async (): Promise<Coords> => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error(
          "Brak zgody na dostęp do lokalizacji. Włącz ją w ustawieniach telefonu dla aplikacji Expo Go.",
        );
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
    } finally {
      setBusy(false);
    }
  }, []);

  return { getCoords, busy };
}
