import { Lock } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontSize, radius, spacing } from "@/src/theme";
import type { Slot } from "@/src/utils/slots";

export type SlotState = "free" | "taken" | "past" | "selected" | "view";

type Props = {
  slot: Slot;
  state: SlotState;
  /** Cena slotu, np. "120,00 zł". Pokazywana tylko dla wolnych terminów. */
  price?: string;
  /** Dodatkowy opis, np. "Recepcja: Janusz" w panelu zarządcy. */
  note?: string | null;
  onPress: () => void;
};

/**
 * KAFELEK TERMINU
 *   free     – wolny, można kliknąć i zarezerwować (zielona ramka),
 *   selected – wybrany (zielone tło),
 *   taken    – zajęty (szary, kłódka),
 *   view     – wolny, ale TYLKO do wglądu: obiekt przyjmuje rezerwacje
 *              telefonicznie, więc aplikacja nie pozwala go zaklepać,
 *   past     – godzina już minęła (wyblakły, nieklikalny).
 */
export function SlotTile({ slot, state, price, note, onPress }: Props) {
  const disabled = state === "past";
  const isTaken = state === "taken";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Termin ${slot.label}, ${
        isTaken ? "zajęty" : state === "past" ? "minął" : "wolny"
      }`}
      style={({ pressed }) => [
        styles.tile,
        state === "free" && styles.free,
        state === "selected" && styles.selected,
        state === "view" && styles.view,
        isTaken && styles.taken,
        state === "past" && styles.past,
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <View style={styles.row}>
        <Text
          style={[
            styles.time,
            state === "selected" && { color: colors.background },
          ]}
        >
          {slot.label}
        </Text>
        {isTaken ? <Lock size={14} color={colors.textMuted} /> : null}
      </View>

      {isTaken ? (
        <Text style={styles.meta}>{note ? note : "Zajęty"}</Text>
      ) : state === "past" ? (
        <Text style={styles.meta}>Minęło</Text>
      ) : state === "view" ? (
        <Text style={styles.meta}>wolny</Text>
      ) : (
        <Text
          style={[
            styles.meta,
            state === "selected"
              ? { color: colors.background }
              : { color: colors.primary },
          ]}
        >
          {price ?? "wolny"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexGrow: 1,
    flexBasis: "47%",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  free: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  view: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  taken: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  past: {
    backgroundColor: "transparent",
    borderColor: colors.border,
    opacity: 0.4,
  },
  time: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
});
