import Constants from "expo-constants";
import { router } from "expo-router";
import {
    ClipboardList,
    LogOut,
    Pencil,
    ShieldCheck,
} from "lucide-react-native";
import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import {
    Avatar,
    Badge,
    Button,
    Card,
    Header,
    Screen,
} from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors, fontSize, SKILL_LABELS, spacing, SPORTS } from "@/src/theme";

/**
 * PROFIL
 *
 * Uwaga o rolach: nie ma tu żadnego przełącznika „zostań zarządcą”. Rolę
 * VENUE_ADMIN nadaje wyłącznie administrator bazy (plik
 * supabase/05_zarzadca_obiektu.sql), a reguła RLS w bazie fizycznie
 * uniemożliwia użytkownikowi zmianę własnej roli. Panel zarządcy pojawia się
 * poniżej tylko wtedy, gdy rola została nadana.
 */
export default function ProfileScreen() {
  const { profile, sports, session, signOut } = useAuth();

  const isAdmin = profile?.role === "VENUE_ADMIN";
  const wersja = Constants.expoConfig?.version ?? "1.0.0";

  if (!profile) {
    return (
      <Screen>
        <Header title="Profil" />
        <Text style={styles.muted}>Brak danych profilu.</Text>
      </Screen>
    );
  }

  const reliability = Number(profile.reliability_score);

  return (
    <Screen>
      <Header title="Profil" />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ alignItems: "center", gap: spacing.sm }}>
          <Avatar name={profile.full_name} size={92} />
          <Text style={styles.name}>{profile.full_name}</Text>
          <Text style={styles.muted}>{session?.user.email}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          <View style={styles.badgeRow}>
            <Badge
              label={`Rzetelność ★ ${reliability.toFixed(2)}`}
              tone={
                reliability >= 4
                  ? "success"
                  : reliability >= 3
                    ? "warning"
                    : "danger"
              }
            />
            <Badge label={`Promień ${profile.max_distance_km} km`} />
            {profile.strikes_count > 0 ? (
              <Badge
                label={`Ostrzeżenia: ${profile.strikes_count}`}
                tone="danger"
              />
            ) : null}
            {isAdmin ? <Badge label="Zarządca obiektu" tone="success" /> : null}
          </View>

          <Button
            label="Edytuj profil i dyscypliny"
            variant="secondary"
            icon={<Pencil size={16} color={colors.primary} />}
            onPress={() => router.push("/(auth)/onboarding")}
            style={{ marginTop: spacing.sm, alignSelf: "stretch" }}
          />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Text style={styles.sectionTitle}>Moje dyscypliny</Text>
          {sports.length === 0 ? (
            <Text style={styles.muted}>
              Nie wybrałeś jeszcze żadnej dyscypliny.
            </Text>
          ) : (
            sports.map((sport) => {
              const meta = SPORTS.find((item) => item.key === sport.sport);
              return (
                <View key={sport.id} style={styles.sportRow}>
                  <Text style={styles.sportName}>
                    {meta?.emoji ?? "•"} {meta?.label ?? sport.sport}
                  </Text>
                  <Badge
                    label={
                      SKILL_LABELS[sport.skill_level] ??
                      `Poziom ${sport.skill_level}`
                    }
                    tone="success"
                  />
                </View>
              );
            })
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <View style={styles.inlineRow}>
            <ShieldCheck
              size={16}
              color={reliability >= 4 ? colors.primary : colors.warning}
            />
            <Text style={styles.sectionTitle}>Rzetelność</Text>
          </View>
          <Text style={styles.muted}>
            Każda nieobecność na zarezerwowanym korcie obniża wskaźnik o 0,25
            punktu. Inni gracze widzą go na Twojej karcie, więc opłaca się
            odwoływać terminy zawczasu.
          </Text>
        </Card>

        {isAdmin ? (
          <Card style={{ gap: spacing.md, borderColor: colors.primary }}>
            <Text style={styles.sectionTitle}>Panel zarządcy obiektu</Text>
            <Text style={styles.muted}>
              Masz uprawnienia recepcji. Możesz blokować terminy rezerwowane
              telefonicznie i zwalniać je z powrotem — gracze zobaczą zmianę
              natychmiast.
            </Text>
            <Button
              label="Otwórz panel zarządcy"
              icon={<ClipboardList size={18} color={colors.background} />}
              onPress={() => router.push("/(tabs)/profile/admin-schedule")}
            />
          </Card>
        ) : null}

        <Button
          label="Wyloguj się"
          variant="danger"
          icon={<LogOut size={18} color={colors.text} />}
          onPress={() => {
            Alert.alert("Wylogować?", "Wrócisz do ekranu logowania.", [
              { text: "Zostaję", style: "cancel" },
              {
                text: "Wyloguj",
                style: "destructive",
                onPress: async () => {
                  await signOut();
                  router.replace("/(auth)/login");
                },
              },
            ]);
          }}
        />

        <Text style={styles.version}>SportMatch {wersja}</Text>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  bio: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  muted: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  sportRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sportName: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  inlineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  version: {
    color: colors.border,
    fontSize: fontSize.xs,
    textAlign: "center",
  },
});
