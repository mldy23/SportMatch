import { router } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { Button, Field, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, spacing } from "@/src/theme";

/**
 * LOGOWANIE I REJESTRACJA
 * Jeden ekran z przełącznikiem trybu — mniej kodu, mniej miejsc na błąd.
 */
export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit() {
    if (!email.includes("@") || password.length < 6) {
      Alert.alert(
        "Sprawdź dane",
        "Podaj poprawny e-mail i hasło o długości min. 6 znaków.",
      );
      return;
    }
    if (isRegister && fullName.trim().length < 2) {
      Alert.alert("Sprawdź dane", "Podaj imię (min. 2 znaki).");
      return;
    }

    setBusy(true);
    try {
      if (isRegister) {
        await signUp(email, password, fullName);
        // Jeśli w Supabase wyłączyłeś potwierdzanie e-maila, użytkownik jest
        // od razu zalogowany i trafia na onboarding.
        router.replace("/");
      } else {
        await signIn(email, password);
        router.replace("/");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd";
      Alert.alert(
        isRegister ? "Nie udało się zarejestrować" : "Nie udało się zalogować",
        message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Text style={styles.logo}>🎾</Text>
            <Text style={styles.title}>SportMatch</Text>
            <Text style={styles.subtitle}>
              Znajdź partnera na sparing 1-na-1 i zarezerwuj kort w dwóch
              kliknięciach.
            </Text>
          </View>

          <View style={{ gap: spacing.lg }}>
            {isRegister ? (
              <Field
                label="Imię"
                placeholder="Jan"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                hint="Tak zobaczą Cię inni gracze. Nazwiska nie zbieramy."
              />
            ) : null}

            <Field
              label="E-mail"
              placeholder="jan@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Field
              label="Hasło"
              placeholder="min. 6 znaków"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Button
              label={isRegister ? "Utwórz konto" : "Zaloguj się"}
              onPress={handleSubmit}
              loading={busy}
            />

            <Button
              variant="ghost"
              label={
                isRegister
                  ? "Mam już konto — zaloguj mnie"
                  : "Nie mam konta — zarejestruj się"
              }
              onPress={() => setMode(isRegister ? "login" : "register")}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: spacing.xxl,
    justifyContent: "center",
    padding: spacing.xl,
  },
  brand: {
    alignItems: "center",
    gap: spacing.sm,
  },
  logo: {
    fontSize: 56,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.huge,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: "center",
  },
});
