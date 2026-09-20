import { Redirect } from "expo-router";
import React from "react";

import { Loading, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/providers/AuthProvider";

/**
 * ROZJAZD (ekran startowy)
 * Decyduje, gdzie posłać użytkownika po otwarciu aplikacji:
 *  - nie zalogowany  -> logowanie
 *  - bez profilu     -> onboarding
 *  - gotowy          -> główny ekran "Znajdź"
 */
export default function Index() {
  const { session, profile, initializing } = useAuth();

  if (initializing) {
    return (
      <Screen>
        <Loading label="Ładuję SportMatch…" />
      </Screen>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile?.onboarded) return <Redirect href="/(auth)/onboarding" />;
  return <Redirect href="/(tabs)/find" />;
}
