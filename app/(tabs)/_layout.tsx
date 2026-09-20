import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Redirect, Tabs } from "expo-router";
import { MapPin, MessageCircle, Ticket, User, Zap } from "lucide-react-native";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { Loading, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, radius, spacing } from "@/src/theme";

/**
 * DOLNA NAWIGACJA — 5 zakładek z wyróżnionym, "pływającym" przyciskiem
 * w środku (ekran "Znajdź"). Jednocześnie pilnuje, by na zakładki wchodził
 * wyłącznie zalogowany użytkownik z ukończonym profilem.
 */
export default function TabsLayout() {
  const { session, profile, initializing } = useAuth();

  if (initializing) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile?.onboarded) return <Redirect href="/(auth)/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.background },
        // Gdy wyjeżdża klawiatura, dolna belka schodzi z drogi. Bez tego na
        // Androidzie zakładki wjeżdżają nad klawiaturę i zasłaniają pole pisania.
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="venues"
        options={{
          title: "Obiekty",
          tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bilety",
          tabBarIcon: ({ color, size }) => <Ticket color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="find"
        options={{
          title: "",
          tabBarIcon: () => (
            <Zap color={colors.background} size={26} strokeWidth={2.5} />
          ),
          tabBarButton: (props) => <FloatingTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Czat",
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

/** Okrągły, wyniesiony ponad belkę przycisk środkowej zakładki. */
function FloatingTabButton({
  children,
  onPress,
  accessibilityState,
}: BottomTabBarButtonProps) {
  const focused = accessibilityState?.selected;
  return (
    <View style={styles.floatingWrapper}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Znajdź partnera"
        style={({ pressed }) => [
          styles.floatingButton,
          focused && styles.floatingButtonFocused,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        {children}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: Platform.OS === "ios" ? 88 : 68,
    paddingTop: spacing.sm,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  floatingWrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 74,
  },
  floatingButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderColor: colors.background,
    borderRadius: radius.pill,
    borderWidth: 4,
    height: 62,
    justifyContent: "center",
    marginTop: -26,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    width: 62,
  },
  floatingButtonFocused: {
    backgroundColor: colors.primaryDark,
  },
});
