import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { Heart, RefreshCw, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { SwipeCard } from "@/src/components/SwipeCard";
import {
    Button,
    EmptyState,
    Header,
    HorizontalRow,
    Loading,
    Pill,
    Screen,
} from "@/src/components/ui";
import { PG_UNIQUE_VIOLATION, supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing, SPORTS } from "@/src/theme";
import type {
    Candidate,
    Match,
    Profile,
    SwipeAction,
} from "@/src/types/database";
import { asRow, asRows } from "@/src/types/database";

/**
 * EKRAN „ZNAJDŹ” — radar sparingowy 1-na-1.
 *
 * 1. Pastylki na górze wybierają dyscyplinę.
 * 2. Baza (funkcja RPC get_match_candidates) zwraca kandydatów spełniających
 *    wszystkie warunki: ta sama dyscyplina, poziom ±1, zasięg w km,
 *    brak wcześniejszego swipe'a, to nie ja.
 * 3. Przesunięcie karty zapisuje LIKE/PASS.
 * 4. Gdy trigger w bazie utworzy Match, Realtime natychmiast otwiera modal.
 */
export default function FindScreen() {
  const { session, profile, sports } = useAuth();
  const myId = session?.user.id;

  const [sport, setSport] = useState<string>(
    () => sports[0]?.sport ?? SPORTS[0].key,
  );
  const [deck, setDeck] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [forced, setForced] = useState<SwipeAction | null>(null);

  // Zapobiega podwójnemu otwarciu modala dla tego samego matchu.
  const handledMatches = useRef<Set<string>>(new Set());

  const sportMeta = SPORTS.find((item) => item.key === sport);

  const loadDeck = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_match_candidates", {
      p_sport: sport,
    });

    if (error) {
      Alert.alert("Nie udało się pobrać graczy", error.message);
      setDeck([]);
    } else {
      setDeck(asRows<Candidate>(data));
    }
    setForced(null);
    setLoading(false);
  }, [myId, sport]);

  // Pobieramy talię po wejściu na ekran, po powrocie z innego ekranu
  // i po każdej zmianie dyscypliny (zmienia się wtedy funkcja loadDeck).
  useFocusEffect(
    useCallback(() => {
      void loadDeck();
    }, [loadDeck]),
  );

  /** NASŁUCH MATCHU — kanał Realtime na tabeli matches. */
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel("my_matches")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches" },
        async (payload) => {
          const match = payload.new as Match;
          // RLS przepuszcza tylko nasze matche, ale sprawdzamy dla pewności.
          if (match.user1_id !== myId && match.user2_id !== myId) return;
          if (handledMatches.current.has(match.id)) return;
          handledMatches.current.add(match.id);

          const partnerId =
            match.user1_id === myId ? match.user2_id : match.user1_id;
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", partnerId)
            .maybeSingle();

          const partner = asRow<Pick<Profile, "id" | "full_name">>(data);

          router.push({
            pathname: "/modal/match-dialog",
            params: {
              matchId: match.id,
              partnerId,
              partnerName: partner?.full_name ?? "Nowy partner",
            },
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myId]);

  /** Zapis decyzji i zdjęcie karty z wierzchu talii. */
  const handleDecision = useCallback(
    async (action: SwipeAction) => {
      // Krótka wibracja — drobiazg, który sprawia, że gest „czuć” w dłoni.
      void Haptics.impactAsync(
        action === "LIKE"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
      );

      const top = deck[0];
      setForced(null);
      setDeck((current) => current.slice(1));
      if (!top || !myId) return;

      const { error } = await supabase.from("swipes").insert({
        swiper_id: myId,
        target_id: top.id,
        action,
      });

      // Duplikat oznacza, że już kiedyś oceniliśmy tę osobę — to nie błąd.
      if (error && error.code !== PG_UNIQUE_VIOLATION) {
        Alert.alert("Nie zapisano decyzji", error.message);
      }
    },
    [deck, myId],
  );

  const myLevel = sports.find((item) => item.sport === sport)?.skill_level;

  return (
    <Screen>
      <Header
        title="Znajdź partnera"
        subtitle={
          myLevel
            ? `Twój poziom: ${myLevel}/4 · promień ${profile?.max_distance_km ?? 15} km`
            : "Dodaj tę dyscyplinę w profilu, by dopasować poziom."
        }
        right={
          <Pressable
            onPress={() => void loadDeck()}
            style={styles.refresh}
            accessibilityLabel="Odśwież"
          >
            <RefreshCw size={18} color={colors.textMuted} />
          </Pressable>
        }
      />

      <HorizontalRow>
        {SPORTS.map((item) => (
          <Pill
            key={item.key}
            label={`${item.emoji} ${item.label}`}
            selected={item.key === sport}
            onPress={() => setSport(item.key)}
          />
        ))}
      </HorizontalRow>

      <View style={styles.deckArea}>
        {loading ? (
          <Loading label="Szukam graczy w okolicy…" />
        ) : deck.length === 0 ? (
          <EmptyState
            title="Brak nowych graczy"
            description={`Nie ma już kogo pokazać w dyscyplinie „${sportMeta?.label}”. Zwiększ promień w profilu albo wróć później.`}
            action={
              <Button
                label="Szukaj ponownie"
                onPress={() => void loadDeck()}
                variant="secondary"
              />
            }
          />
        ) : (
          <View style={styles.deck}>
            {/* Renderujemy maksymalnie dwie karty: aktywną i podglądaną pod nią. */}
            {deck
              .slice(0, 2)
              .reverse()
              .map((candidate, reversedIndex, array) => {
                const isTop = reversedIndex === array.length - 1;
                return (
                  <View
                    key={candidate.id}
                    style={[
                      StyleSheet.absoluteFill,
                      !isTop && {
                        transform: [{ scale: 0.95 }, { translateY: 14 }],
                        opacity: 0.6,
                      },
                    ]}
                  >
                    <SwipeCard
                      candidate={candidate}
                      sportEmoji={sportMeta?.emoji ?? "🎾"}
                      interactive={isTop}
                      force={isTop ? forced : null}
                      onDecision={handleDecision}
                    />
                  </View>
                );
              })}
          </View>
        )}
      </View>

      {!loading && deck.length > 0 ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => setForced("PASS")}
            style={[styles.circleButton, { borderColor: colors.danger }]}
            accessibilityLabel="Pomiń"
          >
            <X size={28} color={colors.danger} />
          </Pressable>

          <Text style={styles.counter}>
            {deck.length} {deck.length === 1 ? "karta" : "kart"}
          </Text>

          <Pressable
            onPress={() => setForced("LIKE")}
            style={[styles.circleButton, { borderColor: colors.primary }]}
            accessibilityLabel="Zaproś na sparing"
          >
            <Heart size={28} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  refresh: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  deckArea: {
    flex: 1,
    padding: spacing.lg,
  },
  deck: {
    flex: 1,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xl,
    justifyContent: "center",
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  circleButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  counter: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    minWidth: 64,
    textAlign: "center",
  },
});
