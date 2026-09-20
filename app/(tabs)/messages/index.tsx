import { router, useFocusEffect } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import {
    Avatar,
    EmptyState,
    Header,
    Loading,
    Screen,
} from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { MatchThread, Message, Profile } from "@/src/types/database";
import { asRows } from "@/src/types/database";
import { formatRelativeDay, formatTime } from "@/src/utils/slots";

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  user1: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
  user2: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
};

/**
 * LISTA WĄTKÓW (sparowani gracze)
 * RLS w bazie dba o to, żeby zapytanie zwróciło wyłącznie nasze matche —
 * nie musimy filtrować po swoim id w kodzie aplikacji.
 */
export default function MessagesScreen() {
  const { session } = useAuth();
  const myId = session?.user.id;

  const [threads, setThreads] = useState<MatchThread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!myId) return;

    const { data: matchData, error } = await supabase
      .from("matches")
      .select(
        "id, user1_id, user2_id, created_at, user1:user1_id(id, full_name, avatar_url), user2:user2_id(id, full_name, avatar_url)",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    const matches = asRows<MatchRow>(matchData);

    // Ostatnia wiadomość dla każdego wątku (jedno zapytanie, grupujemy lokalnie).
    const ids = matches.map((match) => match.id);
    const lastByMatch = new Map<string, Message>();

    if (ids.length > 0) {
      const { data: messageData } = await supabase
        .from("messages")
        .select("*")
        .in("match_id", ids)
        .order("created_at", { ascending: false });

      for (const message of asRows<Message>(messageData)) {
        if (!lastByMatch.has(message.match_id))
          lastByMatch.set(message.match_id, message);
      }
    }

    setThreads(
      matches.map((match) => {
        const partner = match.user1_id === myId ? match.user2 : match.user1;
        const last = lastByMatch.get(match.id);
        return {
          matchId: match.id,
          partner: partner ?? {
            id: "unknown",
            full_name: "Gracz",
            avatar_url: null,
          },
          lastMessage: last?.content ?? null,
          lastMessageAt: last?.created_at ?? match.created_at,
        };
      }),
    );
    setLoading(false);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <Screen>
        <Header title="Czat" />
        <Loading label="Pobieram rozmowy…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Czat"
        subtitle="Twoje pary — dogadajcie termin i lećcie grać."
      />

      {threads.length === 0 ? (
        <EmptyState
          title="Brak par"
          description="Przesuń kartę w prawo na ekranie „Znajdź”. Gdy druga osoba zrobi to samo, pojawi się tu rozmowa."
        />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(thread) => thread.matchId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const stamp = item.lastMessageAt
              ? new Date(item.lastMessageAt)
              : null;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/messages/[id]",
                    params: {
                      id: item.matchId,
                      partnerName: item.partner.full_name,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.row,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Avatar name={item.partner.full_name} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.partner.full_name}</Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessage ?? "Nowa para — napisz pierwszy!"}
                  </Text>
                </View>
                {stamp ? (
                  <Text style={styles.stamp}>
                    {formatRelativeDay(stamp)}
                    {"\n"}
                    {formatTime(stamp)}
                  </Text>
                ) : null}
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  preview: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  stamp: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: "right",
  },
});
