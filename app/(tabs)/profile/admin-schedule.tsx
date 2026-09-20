import { router } from "expo-router";
import { ArrowLeft, Radio } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { SlotTile, type SlotState } from "@/src/components/SlotTile";
import {
    Badge,
    Button,
    Card,
    EmptyState,
    HorizontalRow,
    Loading,
    Pill,
    Screen,
} from "@/src/components/ui";
import { PG_EXCLUSION_VIOLATION, supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { Booking, Court, Venue } from "@/src/types/database";
import { asRows } from "@/src/types/database";
import {
    buildDaySlots,
    describeDay,
    formatSlotLong,
    nextDays,
    parseTstzRange,
    rangesOverlap,
    toDateKey,
    toTstzRange,
    type Slot,
} from "@/src/utils/slots";

/**
 * PANEL ZARZĄDCY (RBAC) — pulpit recepcji.
 *
 * Wolny termin  -> blokada z notatką (booking_source = 'RECEPTION').
 * Zajęty termin -> podgląd i zwolnienie (status = 'CANCELLED').
 *
 * Każda zmiana leci przez Realtime do telefonów graczy, więc slot zmienia
 * kolor u nich natychmiast — bez odświeżania ekranu.
 */
export default function AdminScheduleScreen() {
  const { profile, session } = useAuth();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(() => nextDays(1)[0]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  // stan okna blokowania terminu
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => nextDays(7), []);

  /**
   * Obiekty, którymi ZARZĄDZAMY — tylko te, w których jesteśmy wpisani jako
   * admin_id. To samo ograniczenie obowiązuje w bazie (reguły RLS oraz trigger
   * enforce_booking_rules), więc nie da się go obejść pominięciem aplikacji.
   */
  useEffect(() => {
    if (!session) return;
    void (async () => {
      const { data } = await supabase
        .from("venues")
        .select("*")
        .eq("admin_id", session.user.id)
        .order("name");
      const rows = asRows<Venue>(data);
      setVenues(rows);
      setVenueId((current) => current ?? rows[0]?.id ?? null);
      setLoading(false);
    })();
  }, [session]);

  /** Korty wybranego obiektu. */
  useEffect(() => {
    if (!venueId) return;
    void (async () => {
      const { data } = await supabase
        .from("courts")
        .select("*")
        .eq("venue_id", venueId)
        .order("name");
      const rows = asRows<Court>(data);
      setCourts(rows);
      setCourtId(rows[0]?.id ?? null);
    })();
  }, [venueId]);

  const fetchSlots = useCallback(async () => {
    if (!courtId) return;
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("court_id", courtId)
      .neq("status", "CANCELLED");
    setBookings(asRows<Booking>(data));
  }, [courtId]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  /** Realtime także tutaj — recepcjonista widzi rezerwacje robione z aplikacji. */
  useEffect(() => {
    if (!courtId) return;
    const channel = supabase
      .channel(`admin_court_${courtId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          void fetchSlots();
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [courtId, fetchSlots]);

  const slots = useMemo(() => {
    const daySlots = buildDaySlots(day);
    const occupied = bookings
      .map((booking) => ({ booking, range: parseTstzRange(booking.time_slot) }))
      .filter((item) => item.range !== null);

    return daySlots.map((slot) => {
      const taken = occupied.find(
        (item) =>
          item.range &&
          rangesOverlap(slot.start, slot.end, item.range.start, item.range.end),
      );
      const state: SlotState = taken ? "taken" : "free";
      return { slot, state, booking: taken?.booking ?? null };
    });
  }, [bookings, day]);

  /** BLOKADA TERMINU przez recepcję. */
  async function blockSlot() {
    if (!pendingSlot || !courtId || !session) return;

    setSaving(true);
    const { error } = await supabase.from("bookings").insert({
      court_id: courtId,
      user_id: session.user.id,
      time_slot: toTstzRange(pendingSlot.start, pendingSlot.end),
      booking_source: "RECEPTION",
      reception_notes: note.trim() || "Blokada recepcji",
    });
    setSaving(false);

    if (error) {
      Alert.alert(
        "Nie udało się zablokować",
        error.code === PG_EXCLUSION_VIOLATION
          ? "Ten termin właśnie został zajęty przez gracza w aplikacji."
          : error.message,
      );
    } else {
      setPendingSlot(null);
      setNote("");
      void fetchSlots();
    }
  }

  /** ZWOLNIENIE TERMINU. */
  function releaseSlot(booking: Booking, slot: Slot) {
    Alert.alert(
      "Zwolnić termin?",
      `${formatSlotLong(slot.start, slot.end)}\n${
        booking.booking_source === "RECEPTION"
          ? `Blokada recepcji: ${booking.reception_notes ?? "—"}`
          : `Rezerwacja gracza, kod ${booking.booking_code}`
      }`,
      [
        { text: "Zostawiam", style: "cancel" },
        {
          text: "Odwołaj / zwolnij",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("bookings")
              .update({ status: "CANCELLED" })
              .eq("id", booking.id);
            if (error) Alert.alert("Nie udało się zwolnić", error.message);
            else void fetchSlots();
          },
        },
      ],
    );
  }

  const selectedVenue = venues.find((venue) => venue.id === venueId) ?? null;
  // Obiekt otwarty nie ma grafiku — nie ma tam czego blokować ani zwalniać.
  const obiektOtwarty = selectedVenue?.booking_type === "PUBLIC";

  if (profile?.role !== "VENUE_ADMIN") {
    return (
      <Screen>
        <EmptyState
          title="Brak uprawnień"
          description="Ten panel jest dostępny wyłącznie dla roli VENUE_ADMIN. Rolę nadaje administrator bazy skryptem supabase/05_zarzadca_obiektu.sql."
          action={
            <Button
              label="Wróć do profilu"
              variant="secondary"
              onPress={() => router.back()}
            />
          }
        />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <Loading label="Ładuję grafik…" />
      </Screen>
    );
  }

  if (venues.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Brak przypisanych obiektów"
          description="Masz rolę zarządcy, ale żaden obiekt nie wskazuje Cię jako admin_id. Uzupełnij to skryptem supabase/05_zarzadca_obiektu.sql (punkt 2)."
          action={
            <Button
              label="Wróć do profilu"
              variant="secondary"
              onPress={() => router.back()}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel="Wróć"
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Panel zarządcy</Text>
          <Text style={styles.subtitle}>
            Blokuj i zwalniaj terminy w czasie rzeczywistym
          </Text>
        </View>
        {live ? (
          <View style={styles.liveBadge}>
            <Radio size={12} color={colors.primary} />
            <Text style={styles.liveText}>na żywo</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Obiekt</Text>
        <HorizontalRow style={{ paddingHorizontal: 0 }}>
          {venues.map((venue) => (
            <Pill
              key={venue.id}
              label={venue.name}
              selected={venue.id === venueId}
              onPress={() => setVenueId(venue.id)}
            />
          ))}
        </HorizontalRow>

        <Text style={styles.sectionLabel}>Kort</Text>
        <HorizontalRow style={{ paddingHorizontal: 0 }}>
          {courts.map((court) => (
            <Pill
              key={court.id}
              label={court.name}
              selected={court.id === courtId}
              onPress={() => setCourtId(court.id)}
            />
          ))}
        </HorizontalRow>

        <Text style={styles.sectionLabel}>Dzień</Text>
        <HorizontalRow style={{ paddingHorizontal: 0 }}>
          {days.map((candidate) => {
            const info = describeDay(candidate);
            return (
              <Pill
                key={toDateKey(candidate)}
                label={info.day}
                sublabel={info.weekday}
                selected={toDateKey(candidate) === toDateKey(day)}
                onPress={() => setDay(candidate)}
              />
            );
          })}
        </HorizontalRow>

        {obiektOtwarty ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.subtitle}>
              To obiekt otwarty (wstęp wolny). Nie prowadzi się tu grafiku —
              gracze umawiają się na spotkania, a miejsca nie da się zająć na
              wyłączność.
            </Text>
          </Card>
        ) : (
          <>
            <View style={styles.legend}>
              <Badge label="wolne — kliknij, by zablokować" tone="success" />
              <Badge label="zajęte — kliknij, by zwolnić" />
            </View>

            <View style={styles.grid}>
              {slots.map(({ slot, state, booking }) => (
                <SlotTile
                  key={slot.key}
                  slot={slot}
                  state={state}
                  note={
                    booking
                      ? booking.booking_source === "RECEPTION"
                        ? `Recepcja: ${booking.reception_notes ?? "—"}`
                        : `Gracz · kod ${booking.booking_code}`
                      : null
                  }
                  onPress={() => {
                    if (booking) releaseSlot(booking, slot);
                    else {
                      setPendingSlot(slot);
                      setNote("");
                    }
                  }}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* OKNO BLOKADY TERMINU (odpowiednik BottomSheet) */}
      <Modal visible={pendingSlot !== null} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <Card style={{ gap: spacing.lg }}>
            <Text style={styles.title}>Zablokuj termin</Text>
            {pendingSlot ? (
              <Text style={styles.subtitle}>
                {formatSlotLong(pendingSlot.start, pendingSlot.end)}
              </Text>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              <Text style={styles.fieldLabel}>Notatka recepcji</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Rezerwacja telefoniczna — Janusz"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>

            <Button
              label="Zablokuj termin"
              onPress={() => void blockSlot()}
              loading={saving}
            />
            <Button
              label="Anuluj"
              variant="ghost"
              onPress={() => {
                setPendingSlot(null);
                setNote("");
              }}
            />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  liveBadge: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  liveText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    flex: 1,
    justifyContent: "flex-end",
    padding: spacing.lg,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
