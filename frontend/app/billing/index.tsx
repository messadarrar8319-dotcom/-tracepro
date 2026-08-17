import { useState } from "react";
import { View, ScrollView, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Btn, Divider } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useAuth } from "@/src/auth";

const BENEFITS = [
  "Réceptions & traçabilité complète des lots",
  "Scanner code-barres / QR",
  "Contrôles de température & plans de nettoyage",
  "Non-conformités, pertes & alertes DLC",
  "Statistiques, archives 2 ans & exports PDF/CSV",
  "Rappels quotidiens & gestion des utilisateurs",
];

function currentOrigin(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
  return (process.env.EXPO_PUBLIC_BACKEND_URL as string) || "";
}

export default function Billing() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const isManager = user?.role === "responsable";

  const startCheckout = async () => {
    setBusy(true); setMsg("");
    try {
      const { url }: any = await api.billingCheckout(currentOrigin());
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.assign(url);
      } else {
        setMsg("Ouvrez cette page depuis un navigateur pour vous abonner.");
      }
    } catch (e: any) {
      setMsg(e?.message || "Impossible d'ouvrir le paiement. Réessayez.");
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false} testID="billing-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ backgroundColor: theme.dark, padding: 20, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 20 }}>
          <TP color="#FFF" weight="black" size={30}>TRACEPRO</TP>
          <TP color={theme.brandSecondary} weight="bold" size={12} style={{ marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>Abonnement PRO</TP>
        </View>

        <View style={{ backgroundColor: theme.brand, padding: 18, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 16 }}>
          <TP color="#FFF" weight="black" size={22}>15 JOURS GRATUITS</TP>
          <TP color="#FFF" weight="bold" size={15} style={{ marginTop: 4 }}>puis 12,99 € / mois</TP>
          <TP color="#FFF" size={12} style={{ marginTop: 8 }}>Renouvellement automatique chaque mois. Résiliable à tout moment. Votre carte est enregistrée dès l'inscription et débitée à la fin des 15 jours d'essai.</TP>
        </View>

        <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Inclus dans l'abonnement</TP>
        <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 14, marginBottom: 16 }}>
          {BENEFITS.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: i === BENEFITS.length - 1 ? 0 : 8 }}>
              <TP weight="black" color={theme.success}>✓</TP>
              <TP size={13} style={{ flex: 1 }}>{b}</TP>
            </View>
          ))}
        </View>

        {isManager ? (
          <Btn
            label={busy ? "Ouverture du paiement..." : "Commencer l'essai gratuit"}
            onPress={startCheckout}
            disabled={busy}
            testID="billing-subscribe"
          />
        ) : (
          <View testID="billing-not-manager" style={{ backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
            <TP weight="bold">Demandez à votre responsable d'activer l'abonnement TRACEPRO PRO pour accéder à l'application.</TP>
          </View>
        )}

        {msg ? <TP color={theme.error} weight="bold" style={{ marginTop: 12 }} testID="billing-msg">{msg}</TP> : null}

        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 8 }}>
          <Pressable onPress={() => router.push("/legal?doc=terms")} testID="billing-terms"><TP size={12} weight="bold" color={theme.textMuted}>Conditions d'utilisation</TP></Pressable>
          <Pressable onPress={() => router.push("/legal?doc=privacy")} testID="billing-privacy"><TP size={12} weight="bold" color={theme.textMuted}>Confidentialité</TP></Pressable>
        </View>

        <Pressable onPress={logout} testID="billing-logout" style={{ marginTop: 20 }}>
          <TP size={12} weight="bold" color={theme.textMuted} style={{ textAlign: "center" }}>Se déconnecter</TP>
        </Pressable>

        <TP size={10} color={theme.textMuted} style={{ marginTop: 16, textAlign: "center" }}>
          Paiement sécurisé par Stripe. L'abonnement se renouvelle automatiquement chaque mois sauf résiliation depuis vos réglages. L'essai gratuit de 15 jours ne peut être utilisé qu'une seule fois par entreprise.
        </TP>
      </ScrollView>
    </Screen>
  );
}
