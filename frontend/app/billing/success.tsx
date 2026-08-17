import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen, TP, Btn } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function BillingSuccess() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"checking" | "done" | "pending" | "error">("checking");
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      if (!session_id) { setStatus("error"); return; }
      // Poll the backend which confirms the Stripe session and unlocks access.
      for (let i = 0; i < 8 && !cancelled.current; i++) {
        try {
          const s: any = await api.billingStatus(String(session_id));
          if (s?.has_access) {
            await refresh();
            setStatus("done");
            setTimeout(() => { if (!cancelled.current) router.replace("/(tabs)"); }, 900);
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled.current) setStatus("pending");
    })();
    return () => { cancelled.current = true; };
  }, [session_id]);

  return (
    <Screen scroll={false} testID="billing-success-screen">
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        {status === "checking" ? (
          <>
            <ActivityIndicator size="large" color={theme.brand} />
            <TP weight="black" size={18} style={{ marginTop: 20, textAlign: "center" }}>Activation de votre abonnement…</TP>
            <TP size={13} color={theme.textMuted} style={{ marginTop: 8, textAlign: "center" }}>Merci de patienter quelques secondes.</TP>
          </>
        ) : status === "done" ? (
          <>
            <View style={{ backgroundColor: theme.success, width: 72, height: 72, borderWidth: 2, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center" }}>
              <TP color="#FFF" weight="black" size={36}>✓</TP>
            </View>
            <TP weight="black" size={22} style={{ marginTop: 20, textAlign: "center" }}>Abonnement activé !</TP>
            <TP size={13} color={theme.textMuted} style={{ marginTop: 8, textAlign: "center" }}>Votre essai gratuit de 15 jours a commencé.</TP>
          </>
        ) : status === "pending" ? (
          <>
            <TP weight="black" size={20} style={{ textAlign: "center" }}>Paiement en cours de traitement</TP>
            <TP size={13} color={theme.textMuted} style={{ marginTop: 8, textAlign: "center" }}>Votre abonnement sera activé dans un instant.</TP>
            <View style={{ height: 16 }} />
            <Btn label="Continuer" onPress={() => router.replace("/(tabs)")} testID="success-continue" />
          </>
        ) : (
          <>
            <TP weight="black" size={20} style={{ textAlign: "center" }}>Session introuvable</TP>
            <View style={{ height: 16 }} />
            <Btn label="Retour" onPress={() => router.replace("/billing")} testID="success-back" />
          </>
        )}
      </View>
    </Screen>
  );
}
