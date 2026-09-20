import React, { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { Avatar, Badge } from "@/src/components/ui";
import { SKILL_LABELS, colors, fontSize, radius, spacing } from "@/src/theme";
import type { Candidate, SwipeAction } from "@/src/types/database";
import { formatDistance } from "@/src/utils/geo";

type Props = {
  candidate: Candidate;
  /** Emoji dyscypliny, dla której szukamy partnera. */
  sportEmoji: string;
  /** Wywoływane po zakończeniu animacji odrzucenia karty. */
  onDecision: (action: SwipeAction) => void;
  /** Tylko górna karta reaguje na palec. */
  interactive: boolean;
  /** Ustaw na 'LIKE'/'PASS', aby "przesunąć" kartę przyciskiem. */
  force?: SwipeAction | null;
};

/**
 * KARTA KANDYDATA
 * Przesuwana palcem w lewo (PASS) lub w prawo (LIKE).
 * Animacje liczy react-native-reanimated na wątku UI, więc ruch jest płynny
 * nawet gdy aplikacja pobiera dane w tle.
 */
export function SwipeCard({
  candidate,
  sportEmoji,
  onDecision,
  interactive,
  force,
}: Props) {
  const { width } = useWindowDimensions();
  const threshold = width * 0.28; // ile trzeba przesunąć, by karta "odleciała"

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Przesunięcie kartą za pomocą przycisków pod talią.
  useEffect(() => {
    if (!force) return;
    const direction = force === "LIKE" ? 1 : -1;
    translateX.value = withTiming(
      direction * width * 1.4,
      { duration: 260 },
      (finished) => {
        if (finished) runOnJS(onDecision)(force);
      },
    );
  }, [force, onDecision, translateX, width]);

  const pan = Gesture.Pan()
    .enabled(interactive)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd(() => {
      if (Math.abs(translateX.value) > threshold) {
        const direction = translateX.value > 0 ? 1 : -1;
        const action: SwipeAction = direction > 0 ? "LIKE" : "PASS";
        translateY.value = withTiming(translateY.value + 60, { duration: 220 });
        translateX.value = withTiming(
          direction * width * 1.4,
          { duration: 220 },
          (finished) => {
            if (finished) runOnJS(onDecision)(action);
          },
        );
      } else {
        // Za mały ruch — karta wraca na miejsce.
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-width / 2, 0, width / 2],
      [-12, 0, 12],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, threshold],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-threshold, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        {/* Znaczki pojawiające się w trakcie przesuwania */}
        <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
          <Text style={[styles.stampText, { color: colors.primary }]}>
            GRAMY
          </Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampPass, passStyle]}>
          <Text style={[styles.stampText, { color: colors.danger }]}>PAS</Text>
        </Animated.View>

        <View style={styles.avatarBlock}>
          <Avatar name={candidate.full_name} size={104} />
          <Text style={styles.sportEmoji}>{sportEmoji}</Text>
        </View>

        <Text style={styles.name}>{candidate.full_name}</Text>

        <View style={styles.badgeRow}>
          <Badge
            label={
              SKILL_LABELS[candidate.skill_level] ??
              `Poziom ${candidate.skill_level}`
            }
            tone="success"
          />
          <Badge label={formatDistance(candidate.distance_m)} />
          <Badge
            label={`★ ${Number(candidate.reliability_score).toFixed(1)}`}
            tone={
              Number(candidate.reliability_score) >= 4 ? "success" : "warning"
            }
          />
        </View>

        {candidate.play_style ? (
          <Text style={styles.style}>Styl gry: {candidate.play_style}</Text>
        ) : null}

        {candidate.bio ? (
          <Text style={styles.bio} numberOfLines={4}>
            {candidate.bio}
          </Text>
        ) : null}

        <Text style={styles.hint}>
          ← przesuń w lewo, aby pominąć · w prawo, aby zaprosić →
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.xl,
  },
  avatarBlock: {
    alignItems: "center",
    justifyContent: "center",
  },
  sportEmoji: {
    fontSize: 28,
    marginTop: -14,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "center",
  },
  style: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  bio: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 21,
    textAlign: "center",
  },
  hint: {
    color: colors.border,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  stamp: {
    borderRadius: radius.md,
    borderWidth: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: "absolute",
    top: spacing.xl,
  },
  stampLike: {
    borderColor: colors.primary,
    left: spacing.xl,
    transform: [{ rotate: "-14deg" }],
  },
  stampPass: {
    borderColor: colors.danger,
    right: spacing.xl,
    transform: [{ rotate: "14deg" }],
  },
  stampText: {
    fontSize: fontSize.xl,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
