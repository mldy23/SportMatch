import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { CheckCircle2, Copy, MapPin, Users } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    Badge,
    Button,
    EmptyState,
    Header,
    Loading,
    Screen,
} from "@/src/components/ui";
import { useLocation } from "@/src/hooks/useLocation";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { BookingWithDetails } from "@/src/types/database";
import { asRows } from "@/src/types/database";
import { CHECK_IN_RADIUS_M, calculateDistanceMeters } from "@/src/utils/geo";
import {
    formatBookingCode,
    formatSlotLong,
    minutesUntil,
    parseTstzRange,
} from "@/src/utils/slots";

/**
 * PORTFEL REZERWACJI + SELF CHECK-IN
 *
 * Bilet zawiera 6-cyfrowy kod dla recepcji. Przycisk odprawy pojawia się
 * dopiero w okolicach godziny meczu i wymaga fizycznej obecności:
 * liczymy odległość telefonu od obiektu formułą Haversine i wpuszczamy
 * tylko w promieniu 150 metrów.
 */
export default function BookingsScreen() {
  const { session } = useAuth();
  const { getCoords } = useLocation();
  const myId = session?.user.id;

  const [rows, setRows] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!myId) return;
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "*, courts(name, hourly_rate, venues(name, address, lat, lng, booking_type, phone_number)), " +
          "partner:partner_id(full_name), owner:user_id(full_name)",
      )
      .or(`user_id.eq.${myId},partner_id.eq.${myId}`)
      .neq("status", "CANCELLED")
      .order("time_slot", { ascending: true });

    if (error) {
      Alert.alert("Nie udało się pobrać rezerwacji", error.message);
    } else {
      setRows(asRows<BookingWithDetails>(data));
    }
    setLoading(false);
    setRefreshing(false);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** ODPRAWA: GPS -> Haversine -> update w bazie. */
  async function handleCheckIn(booking: BookingWithDetails) {
    const venue = booking.courts?.venues;
    if (!venue || !myId) return;

    setBusyId(booking.id);
    try {
      const position = await getCoords();
      const distance = calculateDistanceMeters(
        position.lat,
        position.lng,
        venue.lat,
        venue.lng,
      );

      if (distance > CHECK_IN_RADIUS_M) {
        Alert.alert(
          "Błąd lokalizacji",
          `Jesteś za daleko od obiektu (${distance} metrów). Podejdź pod kort, aby się odprawić.`,
        );
        return;
      }

      const isOwner = booking.user_id === myId;
      const patch = isOwner
        ? { user_checked_in: true, status: "CHECKED_IN" as const }
        : { partner_checked_in: true, status: "CHECKED_IN" as const };

      const { error } = await supabase
        .from("bookings")
        .update(patch)
        .eq("id", booking.id);
      if (error) throw error;

      await load();
      Alert.alert("Obecność potwierdzona!", "Miłego sparingu.");
    } catch (error) {
      Alert.alert(
        "Odprawa nieudana",
        error instanceof Error ? error.message : "Spróbuj ponownie.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(booking: BookingWithDetails) {
    Alert.alert(
      booking.is_meetup ? "Odwołać spotkanie?" : "Odwołać rezerwację?",
      booking.is_meetup
        ? "Zniknie z biletów obu osób."
        : "Termin wróci do puli wolnych slotów.",
      [
        { text: "Zostawiam", style: "cancel" },
        {
          text: "Odwołuję",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("bookings")
              .update({ status: "CANCELLED" })
              .eq("id", booking.id);
            if (error) Alert.alert("Nie udało się odwołać", error.message);
            else await load();
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen>
        <Header title="Bilety" />
        <Loading label="Pobieram rezerwacje…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Bilety"
        subtitle="Kod pokaż w recepcji. Odprawa działa na miejscu."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Brak rezerwacji"
          description="Wejdź w „Obiekty”, wybierz kort i zaklep termin — bilet pojawi się tutaj."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={styles.list}
          // Pociągnięcie listy w dół odświeża dane — użytkownicy telefonów
          // robią ten gest odruchowo.
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          renderItem={({ item }) => {
            const range = parseTstzRange(item.time_slot);
            const venue = item.courts?.venues;
            const minutes = range ? minutesUntil(range.start) : 0;
            const finished = range
              ? Date.now() > range.end.getTime() + 15 * 60_000
              : false;

            const isOwner = item.user_id === myId;
            const alreadyCheckedIn = isOwner
              ? item.user_checked_in
              : item.partner_checked_in;
            // Okno odprawy: od 20 minut przed startem do 15 minut po końcu.
            const canCheckIn =
              Boolean(range) && minutes <= 20 && !finished && !alreadyCheckedIn;

            const partnerName = isOwner
              ? item.partner?.full_name
              : item.owner?.full_name;
            // Spotkanie na obiekcie otwartym: bez kortu, bez ceny, bez kodu.
            const isMeetup = item.is_meetup;

            return (
              <View style={[styles.ticket, finished && { opacity: 0.55 }]}>
                <View style={styles.ticketHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.venueName}>
                      {venue?.name ?? "Obiekt"}
                    </Text>
                    <Text style={styles.courtName}>
                      {isMeetup
                        ? "Umówione spotkanie (obiekt otwarty)"
                        : item.courts?.name}
                    </Text>
                  </View>
                  <Badge
                    label={
                      item.status === "CHECKED_IN"
                        ? "odprawiony"
                        : finished
                          ? "zakończony"
                          : isMeetup
                            ? "spotkanie"
                            : "potwierdzony"
                    }
                    tone={
                      item.status === "CHECKED_IN"
                        ? "success"
                        : finished
                          ? "neutral"
                          : isMeetup
                            ? "success"
                            : "warning"
                    }
                  />
                </View>

                {range ? (
                  <Text style={styles.time}>
                    {formatSlotLong(range.start, range.end)}
                  </Text>
                ) : null}

                {venue ? (
                  <View style={styles.metaRow}>
                    <MapPin size={13} color={colors.textMuted} />
                    <Text style={styles.meta}>{venue.address}</Text>
                  </View>
                ) : null}

                {partnerName ? (
                  <View style={styles.metaRow}>
                    <Users size={13} color={colors.primary} />
                    <Text style={[styles.meta, { color: colors.primary }]}>
                      Grasz z: {partnerName}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.meta}>
                    Rezerwacja indywidualna (bez partnera)
                  </Text>
                )}

                {item.booking_source === "RECEPTION" ? (
                  <Text style={styles.meta}>
                    Dodane przez recepcję
                    {item.reception_notes ? `: ${item.reception_notes}` : ""}
                  </Text>
                ) : null}

                {/* KOD DLA RECEPCJI — spotkania na obiektach otwartych go nie mają */}
                {isMeetup ? null : (
                  <Pressable
                    onPress={async () => {
                      await Clipboard.setStringAsync(item.booking_code);
                      Alert.alert(
                        "Skopiowano",
                        `Kod ${formatBookingCode(item.booking_code)} jest w schowku.`,
                      );
                    }}
                    style={styles.codeBox}
                  >
                    <Text style={styles.codeLabel}>KOD</Text>
                    <Text style={styles.code}>
                      {formatBookingCode(item.booking_code)}
                    </Text>
                    <Copy size={16} color={colors.textMuted} />
                  </Pressable>
                )}

                {alreadyCheckedIn ? (
                  <View style={styles.checkedRow}>
                    <CheckCircle2 size={18} color={colors.primary} />
                    <Text style={styles.checkedText}>
                      Twoja obecność jest potwierdzona
                    </Text>
                  </View>
                ) : canCheckIn ? (
                  <Button
                    label="Potwierdź obecność na obiekcie"
                    onPress={() => void handleCheckIn(item)}
                    loading={busyId === item.id}
                  />
                ) : !finished && range ? (
                  <Text style={styles.hint}>
                    Odprawa odblokuje się 20 minut przed grą
                    {minutes > 20 ? ` (za ${formatWait(minutes - 20)})` : ""}.
                  </Text>
                ) : null}

                {!finished && isOwner ? (
                  <Button
                    label={
                      isMeetup ? "Odwołaj spotkanie" : "Odwołaj rezerwację"
                    }
                    variant="ghost"
                    onPress={() => void handleCancel(item)}
                  />
                ) : null}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

/** "35 min" albo "2 godz. 10 min" — czytelny czas oczekiwania. */
function formatWait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} godz.` : `${hours} godz. ${rest} min`;
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  ticket: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  ticketHead: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  venueName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "800",
  },
  courtName: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  time: {
    color: colors.primary,
    fontSize: fontSize.md,
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
    flexShrink: 1,
  },
  codeBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
  },
  codeLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1,
  },
  code: {
    color: colors.text,
    fontFamily: "monospace",
    fontSize: fontSize.xxl,
    fontWeight: "800",
    letterSpacing: 3,
  },
  checkedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  checkedText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
});
