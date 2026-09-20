import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Handshake, Info, Phone, Radio } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { SlotTile, type SlotState } from "@/src/components/SlotTile";
import {
    Badge,
    Button,
    Card,
    HorizontalRow,
    Loading,
    Pill,
    Screen,
} from "@/src/components/ui";
import { PG_EXCLUSION_VIOLATION, supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { Court, CourtSlot, Venue } from "@/src/types/database";
import { asRow, asRows } from "@/src/types/database";
import { calculateDistanceMeters, formatDistance } from "@/src/utils/geo";
import {
    buildDaySlots,
    buildMeetupTimes,
    describeDay,
    formatSlotLong,
    nextDays,
    parseTstzRange,
    rangesOverlap,
    slotPrice,
    toDateKey,
    toTstzRange,
    type Slot,
} from "@/src/utils/slots";

/**
 * EKRAN OBIEKTU — trzy różne zachowania, jeden plik.
 *
 *  IN_APP            gracz sam rezerwuje kort: pełna siatka godzin, klikalna.
 *  EXTERNAL_CONTACT  obiekt przyjmuje rezerwacje tylko telefonicznie, więc
 *                    siatka jest TYLKO DO WGLĄDU (widać, co jest zajęte),
 *                    a jedyną akcją jest telefon. Terminy wprowadza recepcja
 *                    w panelu zarządcy.
 *  PUBLIC            obiekt otwarty — nie ma czego rezerwować. Zamiast
 *                    kalendarza pokazujemy „umów spotkanie”, żeby obie osoby
 *                    widziały, gdzie i kiedy się spotykają.
 *
 * Tych reguł pilnuje też baza danych (trigger enforce_booking_rules), więc
 * nawet pominięcie interfejsu nic nie da.
 */
export default function VenueDetailScreen() {
  const { id, partnerId, partnerName } = useLocalSearchParams<{
    id: string;
    partnerId?: string;
    partnerName?: string;
  }>();
  const { session, profile } = useAuth();

  const [venue, setVenue] = useState<Venue | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(() => nextDays(1)[0]);
  const [zajete, setZajete] = useState<CourtSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);

  const days = useMemo(() => nextDays(7), []);

  /** 1. Dane obiektu i lista kortów. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const [venueResult, courtsResult] = await Promise.all([
        supabase.from("venues").select("*").eq("id", id).maybeSingle(),
        supabase.from("courts").select("*").eq("venue_id", id).order("name"),
      ]);

      if (cancelled) return;
      setVenue(asRow<Venue>(venueResult.data));
      const courtRows = asRows<Court>(courtsResult.data);
      setCourts(courtRows);
      setCourtId((current) => current ?? courtRows[0]?.id ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /**
   * 2. Zajęte terminy wybranego kortu.
   *    Czytamy z tabeli court_slots — publicznego grafiku bez danych osobowych.
   *    Tabela bookings jest prywatna (widzą ją tylko uczestnicy i zarządca),
   *    dlatego siatka godzin nigdy nie ujawnia, KTO grał ani pod jakim kodem.
   */
  const fetchSlots = useCallback(async () => {
    if (!courtId) return;
    const { data, error } = await supabase
      .from("court_slots")
      .select("*")
      .eq("court_id", courtId);

    if (!error) setZajete(asRows<CourtSlot>(data));
  }, [courtId]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  /** 3. REALTIME — natychmiastowa reakcja na zmiany w grafiku. */
  useEffect(() => {
    if (!courtId) return;

    const channel = supabase
      .channel(`court_${courtId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "court_slots" },
        () => {
          void fetchSlots(); // ktoś zajął lub zwolnił termin — przeładuj siatkę
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [courtId, fetchSlots]);

  const selectedCourt = courts.find((court) => court.id === courtId) ?? null;
  const tryb = venue?.booking_type;
  const tylkoPodglad = tryb === "EXTERNAL_CONTACT";

  /** Sloty dnia wraz ze stanem. */
  const slots = useMemo(() => {
    const daySlots = buildDaySlots(day);
    const occupied = zajete
      .map((wiersz) => parseTstzRange(wiersz.time_slot))
      .filter(
        (zakres): zakres is { start: Date; end: Date } => zakres !== null,
      );

    return daySlots.map((slot) => {
      const taken = occupied.some((zakres) =>
        rangesOverlap(slot.start, slot.end, zakres.start, zakres.end),
      );
      const minelo = slot.start.getTime() < Date.now();

      const state: SlotState = taken
        ? "taken"
        : minelo
          ? "past"
          : tylkoPodglad
            ? "view"
            : "free";
      return { slot, state };
    });
  }, [zajete, day, tylkoPodglad]);

  /** Godziny do umówienia spotkania (obiekt otwarty). */
  const meetupTimes = useMemo(() => buildMeetupTimes(day), [day]);

  const distance =
    venue && profile?.lat != null && profile?.lng != null
      ? calculateDistanceMeters(profile.lat, profile.lng, venue.lat, venue.lng)
      : null;

  /** 4a. Rezerwacja kortu (tylko obiekty IN_APP). */
  async function bookSlot(slot: Slot) {
    if (!session || !courtId || !selectedCourt) return;

    const partnerLabel = partnerName ? ` z ${partnerName}` : "";
    Alert.alert(
      "Potwierdź rezerwację",
      `${selectedCourt.name}\n${formatSlotLong(slot.start, slot.end)}${partnerLabel}\nCena: ${slotPrice(
        Number(selectedCourt.hourly_rate),
      )}`,
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Rezerwuję",
          onPress: async () => {
            setSaving(true);
            const { error } = await supabase.from("bookings").insert({
              court_id: courtId,
              user_id: session.user.id,
              partner_id: partnerId ?? null,
              time_slot: toTstzRange(slot.start, slot.end),
              booking_source: "APP",
              is_meetup: false,
            });
            setSaving(false);

            if (error) {
              // 23P01 = więz EXCLUDE: ktoś był szybszy o ułamek sekundy.
              if (error.code === PG_EXCLUSION_VIOLATION) {
                Alert.alert(
                  "Termin już zajęty",
                  "Termin został przed chwilą zajęty przez kogoś innego. Wybierz inną godzinę.",
                );
                void fetchSlots();
              } else {
                Alert.alert("Nie udało się zarezerwować", error.message);
              }
              return;
            }

            void fetchSlots();
            Alert.alert(
              "Zarezerwowane!",
              "Bilet z kodem znajdziesz w zakładce „Bilety”.",
              [
                {
                  text: "Pokaż bilety",
                  onPress: () => router.push("/(tabs)/bookings"),
                },
                { text: "OK" },
              ],
            );
          },
        },
      ],
    );
  }

  /** 4b. Umówienie spotkania (obiekty otwarte). */
  async function arrangeMeetup(slot: Slot) {
    if (!session || !courtId) return;

    Alert.alert(
      "Umówić spotkanie?",
      `${venue?.name}\n${formatSlotLong(slot.start, slot.end)}\n` +
        (partnerName
          ? `Zapisze się u Ciebie i u ${partnerName}.`
          : "Zapisze się tylko u Ciebie — wejdź w czat z partnerem, aby umówić się razem."),
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Umawiam",
          onPress: async () => {
            setSaving(true);
            const { error } = await supabase.from("bookings").insert({
              court_id: courtId,
              user_id: session.user.id,
              partner_id: partnerId ?? null,
              time_slot: toTstzRange(slot.start, slot.end),
              booking_source: "APP",
              is_meetup: true,
            });
            setSaving(false);

            if (error) {
              Alert.alert("Nie udało się umówić", error.message);
              return;
            }

            Alert.alert(
              "Umówione!",
              "Szczegóły spotkania są w zakładce „Bilety”.",
              [
                {
                  text: "Pokaż bilety",
                  onPress: () => router.push("/(tabs)/bookings"),
                },
                { text: "OK" },
              ],
            );
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen>
        <Loading label="Ładuję obiekt…" />
      </Screen>
    );
  }

  if (!venue) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.title}>Nie znaleziono obiektu</Text>
          <Button
            label="Wróć"
            variant="secondary"
            onPress={() => router.back()}
          />
        </View>
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
          <Text style={styles.title} numberOfLines={1}>
            {venue.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {venue.address}
            {distance !== null ? ` · ${formatDistance(distance)}` : ""}
          </Text>
        </View>
        {live && tryb !== "PUBLIC" ? (
          <View style={styles.liveBadge}>
            <Radio size={12} color={colors.primary} />
            <Text style={styles.liveText}>na żywo</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {partnerId ? (
          <Card style={styles.partnerBanner}>
            <Text style={styles.partnerText}>
              🤝 {tryb === "PUBLIC" ? "Umawiasz się" : "Rezerwujesz"} wspólnie z{" "}
              {partnerName ?? "partnerem"} — dopiszemy go do biletu.
            </Text>
          </Card>
        ) : null}

        {/* ---------------------------------------------- OBIEKT TELEFONICZNY */}
        {tryb === "EXTERNAL_CONTACT" ? (
          <Card style={{ gap: spacing.md, borderColor: colors.warning }}>
            <View style={styles.inlineRow}>
              <Info size={16} color={colors.warning} />
              <Text style={styles.sectionTitle}>
                Rezerwacja tylko telefoniczna
              </Text>
            </View>
            <Text style={styles.subtitle}>
              Ten klub nie udostępnia rezerwacji online. Poniżej widzisz
              aktualny grafik — zajęte godziny wpisuje recepcja — ale terminu
              nie zaklepiesz w aplikacji. Zadzwoń, aby zarezerwować.
            </Text>
            {venue.phone_number ? (
              <Button
                label={`Zadzwoń: ${venue.phone_number}`}
                icon={<Phone size={18} color={colors.background} />}
                onPress={() =>
                  void Linking.openURL(`tel:${venue.phone_number}`)
                }
              />
            ) : null}
          </Card>
        ) : null}

        {/* ---------------------------------------------- OBIEKT OTWARTY */}
        {tryb === "PUBLIC" ? (
          <>
            <Card style={{ gap: spacing.sm, borderColor: colors.primary }}>
              <View style={styles.inlineRow}>
                <Handshake size={16} color={colors.primary} />
                <Text style={styles.sectionTitle}>
                  Obiekt otwarty — wstęp wolny
                </Text>
              </View>
              <Text style={styles.subtitle}>
                Tutaj nie ma czego rezerwować i nikt nie może zająć miejsca na
                wyłączność. Możesz natomiast umówić się na konkretną godzinę,
                żeby oboje mieli to zapisane w zakładce „Bilety”.
              </Text>
            </Card>

            <Text style={styles.sectionLabel}>Wybierz dzień</Text>
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

            <Text style={styles.sectionLabel}>O której się spotykacie?</Text>
            {courts.length === 0 ? (
              <Card>
                <Text style={styles.subtitle}>
                  Ten obiekt nie ma jeszcze zdefiniowanego punktu spotkania.
                  Dodaj mu jeden wiersz w tabeli `courts` (np. „Pętla 2 km”) —
                  służy tylko do zapisania miejsca zbiórki.
                </Text>
              </Card>
            ) : null}
            <View style={styles.timeGrid}>
              {meetupTimes.map((slot) => {
                const minelo = slot.start.getTime() < Date.now();
                return (
                  <Pressable
                    key={slot.key}
                    disabled={minelo || saving}
                    onPress={() => void arrangeMeetup(slot)}
                    style={({ pressed }) => [
                      styles.timeChip,
                      minelo && styles.timeChipPast,
                      pressed && !minelo && { opacity: 0.75 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timeChipText,
                        minelo && { color: colors.border },
                      ]}
                    >
                      {slot.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ---------------------------------------------- SIATKA TERMINÓW */}
        {tryb !== "PUBLIC" ? (
          courts.length === 0 ? (
            <Card>
              <Text style={styles.subtitle}>
                Ten obiekt nie ma jeszcze dodanych kortów.
              </Text>
            </Card>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Wybierz kort</Text>
              <HorizontalRow style={{ paddingHorizontal: 0 }}>
                {courts.map((court) => (
                  <Pill
                    key={court.id}
                    label={court.name}
                    sublabel={`${Number(court.hourly_rate).toFixed(0)} zł/h`}
                    selected={court.id === courtId}
                    onPress={() => setCourtId(court.id)}
                  />
                ))}
              </HorizontalRow>

              <Text style={styles.sectionLabel}>Wybierz dzień</Text>
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

              <View style={styles.legend}>
                {tylkoPodglad ? (
                  <Badge label="tylko podgląd" tone="warning" />
                ) : (
                  <Badge label="wolne" tone="success" />
                )}
                <Badge label="zajęte" />
                <Text style={styles.legendText}>
                  sloty po 90 minut, 08:00–22:00
                </Text>
              </View>

              <View style={styles.grid}>
                {slots.map(({ slot, state }) => (
                  <SlotTile
                    key={slot.key}
                    slot={slot}
                    state={state}
                    price={
                      tylkoPodglad || !selectedCourt
                        ? undefined
                        : slotPrice(Number(selectedCourt.hourly_rate))
                    }
                    onPress={() => {
                      if (state === "taken") {
                        Alert.alert(
                          "Termin zajęty",
                          "Ten kort jest w tej godzinie już zarezerwowany.",
                        );
                        return;
                      }
                      if (state === "view") {
                        Alert.alert(
                          "Rezerwacja telefoniczna",
                          venue.phone_number
                            ? `Ten obiekt przyjmuje rezerwacje tylko telefonicznie.\nZadzwoń: ${venue.phone_number}`
                            : "Ten obiekt przyjmuje rezerwacje tylko telefonicznie.",
                          venue.phone_number
                            ? [
                                { text: "Zamknij", style: "cancel" },
                                {
                                  text: "Zadzwoń",
                                  onPress: () =>
                                    void Linking.openURL(
                                      `tel:${venue.phone_number}`,
                                    ),
                                },
                              ]
                            : [{ text: "OK" }],
                        );
                        return;
                      }
                      if (state === "free" && !saving) void bookSlot(slot);
                    }}
                  />
                ))}
              </View>
            </>
          )
        ) : null}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
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
  centered: {
    alignItems: "center",
    flex: 1,
    gap: spacing.lg,
    justifyContent: "center",
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  inlineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
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
  partnerBanner: {
    borderColor: colors.primary,
    paddingVertical: spacing.md,
  },
  partnerText: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  legend: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  timeChip: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  timeChipPast: {
    borderColor: colors.border,
    opacity: 0.4,
  },
  timeChipText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
});
