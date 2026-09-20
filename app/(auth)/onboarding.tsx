import { router } from "expo-router";
import { MapPin } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    Button,
    Card,
    Field,
    Header,
    Screen,
    ValueSlider,
} from "@/src/components/ui";
import { useLocation } from "@/src/hooks/useLocation";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import {
    colors,
    fontSize,
    radius,
    SKILL_LABELS,
    spacing,
    SPORTS,
} from "@/src/theme";

/**
 * ONBOARDING — jednorazowa konfiguracja profilu.
 * Bez tych danych algorytm dopasowania nie ma czym pracować:
 *  - współrzędne (żeby liczyć odległość),
 *  - promień poszukiwań,
 *  - dyscypliny wraz z poziomem 1–4.
 */
export default function OnboardingScreen() {
  const { session, profile, sports, refresh } = useAuth();
  const { getCoords, busy: locating } = useLocation();

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [radiusKm, setRadiusKm] = useState(15);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  /** Mapa: klucz sportu -> wybrany poziom (1–4). Brak klucza = sport nieaktywny. */
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Wypełnij formularz danymi, które już mamy (np. przy powrocie do edycji).
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setBio(profile.bio ?? "");
      setRadiusKm(profile.max_distance_km ?? 15);
      if (profile.lat !== null && profile.lng !== null) {
        setCoords({ lat: profile.lat, lng: profile.lng });
      }
    }
    if (sports.length > 0) {
      setLevels(
        Object.fromEntries(
          sports.map((sport) => [sport.sport, sport.skill_level]),
        ),
      );
    }
  }, [profile, sports]);

  function toggleSport(key: string) {
    setLevels((current) => {
      const copy = { ...current };
      if (copy[key]) delete copy[key];
      else copy[key] = 2;
      return copy;
    });
  }

  function setLevel(key: string, level: number) {
    setLevels((current) => ({ ...current, [key]: level }));
  }

  async function handleLocate() {
    try {
      const position = await getCoords();
      setCoords(position);
    } catch (error) {
      Alert.alert(
        "Lokalizacja",
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać pozycji.",
      );
    }
  }

  async function handleSave() {
    if (!session) return;

    if (fullName.trim().length < 2) {
      Alert.alert("Uzupełnij profil", "Podaj imię.");
      return;
    }
    if (!coords) {
      Alert.alert(
        "Uzupełnij profil",
        "Naciśnij „Pobierz moją lokalizację”, aby ustawić punkt startowy.",
      );
      return;
    }
    const chosen = Object.entries(levels);
    if (chosen.length === 0) {
      Alert.alert("Uzupełnij profil", "Wybierz przynajmniej jedną dyscyplinę.");
      return;
    }

    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          bio: bio.trim() || null,
          lat: coords.lat,
          lng: coords.lng,
          // Suwak pilnuje zakresu 0–200, baza dodatkowo sprawdza to po swojej stronie.
          max_distance_km: Math.min(Math.max(radiusKm, 0), 200),
          onboarded: true,
        })
        .eq("id", session.user.id);

      if (profileError) throw profileError;

      // upsert = dodaj lub nadpisz poziom, jeśli dyscyplina już istnieje
      const { error: sportsError } = await supabase.from("user_sports").upsert(
        chosen.map(([sport, skill_level]) => ({
          user_id: session.user.id,
          sport,
          skill_level,
        })),
        { onConflict: "user_id,sport" },
      );

      if (sportsError) throw sportsError;

      // usuń dyscypliny, które użytkownik odznaczył
      const removed = sports
        .map((s) => s.sport)
        .filter((sport) => !levels[sport]);
      if (removed.length > 0) {
        await supabase
          .from("user_sports")
          .delete()
          .eq("user_id", session.user.id)
          .in("sport", removed);
      }

      await refresh();
      router.replace("/(tabs)/find");
    } catch (error) {
      Alert.alert(
        "Błąd zapisu",
        error instanceof Error ? error.message : "Spróbuj ponownie.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Header
        title="Twój profil"
        subtitle="Te dane decydują, kogo Ci pokażemy."
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: spacing.lg }}>
          <Field
            label="Imię"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Jan"
            hint="Tak zobaczą Cię inni gracze. Nazwiska nie zbieramy."
          />
          <Field
            label="O mnie"
            value={bio}
            onChangeText={setBio}
            placeholder="Gram 2x w tygodniu, wolę wieczory…"
            multiline
            numberOfLines={3}
            style={styles.multiline}
          />
          <ValueSlider
            label="Maksymalny promień poszukiwań"
            value={radiusKm}
            onChange={setRadiusKm}
            minimum={0}
            maximum={200}
            step={5}
            formatValue={(km) => `${km} km`}
            hint="Dalszych graczy nie pokażemy w talii kart."
          />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.sectionTitle}>Lokalizacja startowa</Text>
          <Text style={styles.sectionHint}>
            {coords
              ? `Zapisane: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
              : "Jeszcze nie ustawiona."}
          </Text>
          <Button
            variant="secondary"
            label={locating ? "Pobieram…" : "Pobierz moją lokalizację"}
            icon={<MapPin size={18} color={colors.primary} />}
            onPress={handleLocate}
            loading={locating}
          />
        </Card>

        <Card style={{ gap: spacing.lg }}>
          <Text style={styles.sectionTitle}>Dyscypliny i poziom</Text>
          {SPORTS.map((sport) => {
            const active = Boolean(levels[sport.key]);
            return (
              <View key={sport.key} style={{ gap: spacing.sm }}>
                <Pressable
                  onPress={() => toggleSport(sport.key)}
                  style={[styles.sportRow, active && styles.sportRowActive]}
                >
                  <Text style={styles.sportLabel}>
                    {sport.emoji} {sport.label}
                  </Text>
                  <Text
                    style={[
                      styles.sportToggle,
                      active && { color: colors.primary },
                    ]}
                  >
                    {active ? "wybrany" : "dodaj"}
                  </Text>
                </Pressable>

                {active ? (
                  <View style={styles.levelRow}>
                    {[1, 2, 3, 4].map((level) => {
                      const selected = levels[sport.key] === level;
                      return (
                        <Pressable
                          key={level}
                          onPress={() => setLevel(sport.key, level)}
                          style={[
                            styles.levelChip,
                            selected && styles.levelChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.levelLabel,
                              selected && {
                                color: colors.background,
                                fontWeight: "800",
                              },
                            ]}
                          >
                            {level}. {SKILL_LABELS[level]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        <Button
          label="Zapisz i zaczynajmy"
          onPress={handleSave}
          loading={saving}
        />
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  multiline: {
    height: 90,
    textAlignVertical: "top",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  sportRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sportRowActive: {
    borderColor: colors.primary,
  },
  sportLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  sportToggle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  levelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  levelChip: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  levelChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  levelLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
});
