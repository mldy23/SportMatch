import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/src/providers/AuthProvider";
import { colors } from "@/src/theme";

/**
 * KORZEŃ APLIKACJI
 *
 * Wszystko, co ma działać na każdym ekranie, montujemy tutaj:
 *  - GestureHandlerRootView — bez tego nie zadziałają gesty (przesuwanie kart),
 *  - SafeAreaProvider — marginesy pod notch i pasek nawigacji,
 *  - AuthProvider — sesja i profil użytkownika,
 *  - Stack — stos ekranów: logowanie, zakładki i modal "Mamy to!".
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="modal/match-dialog"
              options={{
                presentation: "transparentModal",
                animation: "fade",
              }}
            />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
