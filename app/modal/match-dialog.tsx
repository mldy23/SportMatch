import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

import { Avatar, Button } from "@/src/components/ui";
import { colors, fontSize, radius, spacing } from "@/src/theme";

/**
 * MODAL „MAMY TO!”
 * Otwierany automatycznie przez nasłuch Realtime po utworzeniu matchu.
 * Daje dwie drogi dalej: rozmowa albo od razu rezerwacja kortu z partnerem.
 */
export default function MatchDialog() {
  const params = useLocalSearchParams<{
    matchId?: string;
    partnerId?: string;
    partnerName?: string;
  }>();

  const partnerName = params.partnerName ?? "Nowy partner";
  const scale = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12 });
    // Wibracja „sukces” — moment matchu ma być odczuwalny, nie tylko widoczny.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable style={styles.backdrop} onPress={() => router.back()}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text style={styles.emoji}>🤝</Text>
        <Text style={styles.title}>Mamy to!</Text>
        <Text style={styles.subtitle}>
          {partnerName} też chce z Tobą zagrać. Umówcie termin, póki gorące.
        </Text>

        <View style={styles.avatars}>
          <Avatar name="Ty" size={64} />
          <Text style={styles.plus}>+</Text>
          <Avatar name={partnerName} size={64} />
        </View>

        <View style={{ gap: spacing.sm, width: "100%" }}>
          <Button
            label="Napisz wiadomość"
            onPress={() => {
              if (!params.matchId) return router.back();
              router.replace({
                pathname: "/(tabs)/messages/[id]",
                params: { id: params.matchId, partnerName },
              });
            }}
          />
          <Button
            label="Zarezerwuj kort"
            variant="secondary"
            onPress={() => {
              router.replace({
                pathname: "/(tabs)/venues",
                params: params.partnerId ? { partnerId: params.partnerId } : {},
              });
            }}
          />
          <Button
            label="Później"
            variant="ghost"
            onPress={() => router.back()}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.xl,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.xl,
    width: "100%",
  },
  emoji: {
    fontSize: 56,
  },
  title: {
    color: colors.primary,
    fontSize: fontSize.huge,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: "center",
  },
  avatars: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  plus: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: "900",
  },
});
