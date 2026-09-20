import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, MapPin, Phone } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import {
    Badge,
    EmptyState,
    Header,
    HorizontalRow,
    Loading,
    Pill,
    Screen,
} from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { BookingType, Venue } from "@/src/types/database";
import { asRows } from "@/src/types/database";
import { calculateDistanceMeters, formatDistance } from "@/src/utils/geo";

type Filter = "ALL" | BookingType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Wszystkie" },
  { key: "IN_APP", label: "Rezerwacja w apce" },
  { key: "EXTERNAL_CONTACT", label: "Przez telefon" },
  { key: "PUBLIC", label: "Otwarte / darmowe" },
];

const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  IN_APP: "Rezerwacja w aplikacji",
  EXTERNAL_CONTACT: "Podgląd grafiku + telefon",
  PUBLIC: "Wstęp wolny — umów spotkanie",
};

type VenueRow = Venue & { courts: { id: string }[] | null };

/**
 * KATALOG OBIEKTÓW
 * Lista posortowana po odległości od użytkownika (liczonej lokalnie
 * formułą Haversine, bez dodatkowego zapytania do bazy).
 *
 * Jeśli przyszliśmy tu z czatu/modala matchu, w adresie siedzi `partnerId`
 * i przekazujemy go dalej — rezerwacja od razu obejmie obie osoby.
 */
export default function VenuesScreen() {
  const { profile } = useAuth();
  const { partnerId, partnerName } = useLocalSearchParams<{
    partnerId?: string;
    partnerName?: string;
  }>();

  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("venues")
      .select("*, courts(id)")
      .order("name");

    if (!error) setVenues(asRows<VenueRow>(data));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Dokładamy odległość i sortujemy: najbliższe na górze. */
  const rows = useMemo(() => {
    const withDistance = venues.map((venue) => ({
      venue,
      distance:
        profile?.lat != null && profile?.lng != null
          ? calculateDistanceMeters(
              profile.lat,
              profile.lng,
              venue.lat,
              venue.lng,
            )
          : null,
    }));

    const filtered =
      filter === "ALL"
        ? withDistance
        : withDistance.filter((row) => row.venue.booking_type === filter);

    return filtered.sort(
      (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
    );
  }, [venues, filter, profile?.lat, profile?.lng]);

  return (
    <Screen>
      <Header
        title="Obiekty"
        subtitle={
          partnerId
            ? `Rezerwujesz razem z: ${partnerName ?? "wybranym partnerem"}`
            : "Wybierz miejsce, w którym chcesz zagrać."
        }
      />

      <HorizontalRow>
        {FILTERS.map((item) => (
          <Pill
            key={item.key}
            label={item.label}
            selected={filter === item.key}
            onPress={() => setFilter(item.key)}
          />
        ))}
      </HorizontalRow>

      {loading ? (
        <Loading label="Pobieram obiekty…" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Brak obiektów"
          description="Uruchom skrypt 02_seed_venues.sql w Supabase, aby dodać przykładowe kluby."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.venue.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/venues/[id]",
                  params: {
                    id: item.venue.id,
                    ...(partnerId ? { partnerId } : {}),
                    ...(partnerName ? { partnerName } : {}),
                  },
                })
              }
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text style={styles.name}>{item.venue.name}</Text>

                <View style={styles.metaRow}>
                  <MapPin size={13} color={colors.textMuted} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.venue.address}
                  </Text>
                </View>

                <View style={styles.badges}>
                  <Badge
                    label={BOOKING_TYPE_LABEL[item.venue.booking_type]}
                    tone={
                      item.venue.booking_type === "IN_APP"
                        ? "success"
                        : "neutral"
                    }
                  />
                  {item.distance !== null ? (
                    <Badge label={formatDistance(item.distance)} />
                  ) : null}
                  <Badge label={`${item.venue.courts?.length ?? 0} korty`} />
                  {item.venue.phone_number ? (
                    <View style={styles.metaRow}>
                      <Phone size={12} color={colors.textMuted} />
                      <Text style={styles.meta}>{item.venue.phone_number}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <ChevronRight size={20} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  badges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
