import Slider from "@react-native-community/slider";
import React from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type StyleProp,
    type TextInputProps,
    type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fontSize, radius, spacing } from "@/src/theme";

/**
 * WSPÓLNE KLOCKI INTERFEJSU
 * Dzięki nim wszystkie ekrany wyglądają spójnie, a kod ekranów jest krótki.
 */

/** Tło ekranu z bezpiecznymi marginesami (notch, pasek statusu). */
export function Screen({
  children,
  style,
  edges = ["top"],
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <View style={[styles.screenInner, style]}>{children}</View>
    </SafeAreaView>
  );
}

/** Nagłówek ekranu: duży tytuł + opcjonalny podtytuł i element po prawej. */
export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Karta — ciemna powierzchnia z obramowaniem. */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        variant === "ghost" && styles.buttonGhost,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.background : colors.text}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonLabel,
              variant === "primary" && { color: colors.background },
              variant === "ghost" && { color: colors.textMuted },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Pole tekstowe z etykietą. */
export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Mała etykietka (np. poziom, dyscyplina, status). */
export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneColor =
    tone === "success"
      ? colors.primary
      : tone === "warning"
        ? colors.warning
        : tone === "danger"
          ? colors.danger
          : colors.textMuted;

  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={[styles.badgeLabel, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

/** Kółko z inicjałami lub zdjęciem — zastępuje awatar. */
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text
        style={{
          color: colors.primary,
          fontSize: size / 2.6,
          fontWeight: "700",
        }}
      >
        {initials || "?"}
      </Text>
    </View>
  );
}

/** Wyśrodkowany spinner na czas ładowania danych. */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.emptyText}>{label}</Text> : null}
    </View>
  );
}

/** Komunikat "nic tu nie ma" z opcjonalnym przyciskiem. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyText}>{description}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  );
}

/**
 * Poziomy pasek przewijanych elementów (pastylki, dni, korty).
 *
 * WAŻNE: `style={styles.horizontalRow}` z flexGrow/flexShrink = 0 jest tu
 * obowiązkowe. Bez tego poziomy ScrollView umieszczony w kolumnie rozciąga się
 * na całą wolną wysokość ekranu — a wtedy pastylki puchną w dół, gdy lista pod
 * nimi jest krótka (albo pusta). To jedna z najczęstszych niespodzianek
 * w React Native.
 */
export function HorizontalRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.horizontalRow}
      contentContainerStyle={[styles.horizontalRowContent, style]}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Suwak wyboru liczby (używany do promienia poszukiwań 0–200 km).
 * Korzysta z @react-native-community/slider — biblioteki certyfikowanej
 * dla Expo Go, więc działa bez budowania własnej aplikacji.
 */
export function ValueSlider({
  label,
  value,
  onChange,
  minimum = 0,
  maximum = 200,
  step = 5,
  formatValue,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  minimum?: number;
  maximum?: number;
  step?: number;
  formatValue?: (value: number) => string;
  hint?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={styles.sliderHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.sliderValue}>
          {formatValue ? formatValue(value) : String(value)}
        </Text>
      </View>

      <Slider
        value={value}
        onValueChange={(next) => onChange(Math.round(next))}
        minimumValue={minimum}
        maximumValue={maximum}
        step={step}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.primary}
        style={styles.slider}
      />

      <View style={styles.sliderScale}>
        <Text style={styles.sliderScaleText}>{minimum} km</Text>
        <Text style={styles.sliderScaleText}>{maximum} km</Text>
      </View>

      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Klikalna pastylka (wybór sportu, kortu, dnia). */
export function Pill({
  label,
  sublabel,
  selected,
  onPress,
}: {
  label: string;
  sublabel?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={[styles.pillLabel, selected && { color: colors.background }]}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text
          style={[styles.pillSub, selected && { color: colors.background }]}
        >
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenInner: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonGhost: { backgroundColor: "transparent" },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgeLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  horizontalRow: {
    // Bez tych dwóch linii pastylki rozciągają się w dół przy krótkiej liście.
    flexGrow: 0,
    flexShrink: 0,
  },
  horizontalRowContent: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  slider: {
    height: 40,
    width: "100%",
  },
  sliderHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderValue: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  sliderScale: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderScaleText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  pill: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    minWidth: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  pillSub: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
});
