import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, CalendarPlus, Send } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { Avatar, Screen } from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { Message, Profile } from "@/src/types/database";
import { asRow, asRows } from "@/src/types/database";
import { formatRelativeDay, formatTime } from "@/src/utils/slots";

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  user1: Pick<Profile, "id" | "full_name"> | null;
  user2: Pick<Profile, "id" | "full_name"> | null;
};

/**
 * CZAT 1-NA-1
 *
 * Wiadomości pobieramy raz, a potem dopisujemy je na bieżąco z kanału
 * Realtime (filtr match_id=eq.<id>), więc nie odpytujemy bazy w pętli.
 * Nad rozmową wisi pasek akcji prowadzący prosto do rezerwacji kortu.
 */
export default function ChatScreen() {
  const { id, partnerName: partnerNameParam } = useLocalSearchParams<{
    id: string;
    partnerName?: string;
  }>();
  const { session } = useAuth();
  const myId = session?.user.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [partner, setPartner] = useState<{
    id: string;
    full_name: string;
  } | null>(partnerNameParam ? { id: "", full_name: partnerNameParam } : null);

  const listRef = useRef<FlatList<Message>>(null);

  /** Kto jest po drugiej stronie? (potrzebne do rezerwacji z partnerem) */
  useEffect(() => {
    if (!myId || !id) return;

    void (async () => {
      const { data } = await supabase
        .from("matches")
        .select(
          "id, user1_id, user2_id, user1:user1_id(id, full_name), user2:user2_id(id, full_name)",
        )
        .eq("id", id)
        .maybeSingle();

      const match = asRow<MatchRow>(data);
      if (!match) return;
      const other = match.user1_id === myId ? match.user2 : match.user1;
      if (other) setPartner({ id: other.id, full_name: other.full_name });
    })();
  }, [id, myId]);

  /** Historia rozmowy. */
  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("match_id", id)
      .order("created_at", { ascending: true });

    setMessages(asRows<Message>(data));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** REALTIME — nowe wiadomości w tym wątku. */
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`chat_room_${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${id}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  /**
   * KLAWIATURA
   * Gdy wyjeżdża klawiatura, przewijamy rozmowę na sam dół, żeby ostatnia
   * wiadomość i pole pisania były widoczne. Dodatkowo w app.json ustawiamy
   * androidowi `softwareKeyboardLayoutMode: "pan"`, a w zakładkach
   * `tabBarHideOnKeyboard` — to zestaw zalecany przez dokumentację Expo dla
   * ekranu czatu wewnątrz dolnej nawigacji.
   */
  useEffect(() => {
    const zdarzenie =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const nasluch = Keyboard.addListener(zdarzenie, () => {
      // krótka zwłoka: czekamy, aż układ ekranu ustabilizuje się po animacji
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => nasluch.remove();
  }, []);

  async function send() {
    const content = draft.trim();
    if (!content || !myId || !id) return;

    setSending(true);
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      match_id: id,
      sender_id: myId,
      content,
    });
    setSending(false);

    if (error) {
      setDraft(content); // przywróć tekst, żeby użytkownik nie stracił wpisu
      Alert.alert("Nie wysłano", error.message);
    }
  }

  return (
    <Screen edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityLabel="Wróć"
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Avatar name={partner?.full_name ?? "Gracz"} size={38} />
        <Text style={styles.title} numberOfLines={1}>
          {partner?.full_name ?? "Rozmowa"}
        </Text>
      </View>

      {/* STICKY ACTION BAR — skrót do rezerwacji wspólnego terminu */}
      <View style={styles.actionBar}>
        <Text style={styles.actionText}>Gotowi na sparing?</Text>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(tabs)/venues",
              params: {
                ...(partner?.id ? { partnerId: partner.id } : {}),
                ...(partner?.full_name
                  ? { partnerName: partner.full_name }
                  : {}),
              },
            })
          }
          style={({ pressed }) => [
            styles.actionButton,
            pressed && { opacity: 0.85 },
          ]}
        >
          <CalendarPlus size={16} color={colors.background} />
          <Text style={styles.actionButtonLabel}>
            Zaproponuj termin na korcie
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              Jeszcze nic tu nie ma. Zacznij od „Kiedy masz czas w tym
              tygodniu?”.
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === myId;
            const stamp = new Date(item.created_at);
            return (
              <View
                style={[
                  styles.bubbleRow,
                  mine ? styles.rowMine : styles.rowTheirs,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      mine && { color: colors.background },
                    ]}
                  >
                    {item.content}
                  </Text>
                  <Text
                    style={[
                      styles.bubbleStamp,
                      mine && { color: colors.background },
                    ]}
                  >
                    {formatRelativeDay(stamp)} {formatTime(stamp)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Napisz wiadomość…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={() => void send()}
            disabled={sending || draft.trim().length === 0}
            style={[
              styles.sendButton,
              (sending || draft.trim().length === 0) && { opacity: 0.4 },
            ]}
            accessibilityLabel="Wyślij"
          >
            <Send size={20} color={colors.background} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "800",
  },
  actionBar: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionButtonLabel: {
    color: colors.background,
    fontSize: fontSize.xs,
    fontWeight: "800",
  },
  list: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xxl,
    textAlign: "center",
  },
  bubbleRow: {
    flexDirection: "row",
  },
  rowMine: {
    justifyContent: "flex-end",
  },
  rowTheirs: {
    justifyContent: "flex-start",
  },
  bubble: {
    borderRadius: radius.lg,
    gap: 2,
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
  },
  bubbleText: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  bubbleStamp: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "right",
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: fontSize.md,
    maxHeight: 110,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
});
