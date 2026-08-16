import { useState } from "react";
import { View, ScrollView, Pressable, Platform, Linking, Modal, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Btn, Divider } from "@/src/ui";
import { theme } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useSubscription } from "@/src/revenuecat";

const BENEFITS = [
  "Réceptions & traçabilité complète des lots",
  "Scanner code-barres / QR",
  "Contrôles de température & plans de nettoyage",
  "Non-conformités, pertes & alertes DLC",
  "Statistiques, archives 2 ans & exports PDF/CSV",
  "Rappels quotidiens & gestion des utilisateurs",
];

export default function Paywall() {
  const router = useRouter();
  const { logout } = useAuth();
  const { offerings, purchase, restore, isPurchasing, isRestoring, identityReady, identityError, isSubscribed } = useSubscription();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");

  const current = offerings?.current;
  const pkg = current?.availablePackages?.[0];
  const priceString = pkg?.product?.priceString || "12,99 €";
  const offeringsUnavailable = !pkg;

  const doPurchase = async () => {
    setConfirm(false); setMsg("");
    try {
      const info: any = await purchase(pkg!);
      if (info?.entitlements?.active?.pro) {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      if (String(e?.userCancelled) === "true" || e?.code === "1" || /cancel/i.test(String(e?.message))) return;
      setMsg(e?.message || "Achat impossible. Réessayez.");
    }
  };

  const doRestore = async () => {
    setMsg("");
    try {
      const info: any = await restore();
      if (info?.entitlements?.active?.pro) router.replace("/(tabs)");
      else setMsg("Aucun abonnement actif trouvé à restaurer.");
    } catch (e: any) { setMsg(e?.message || "Restauration impossible."); }
  };

  const manageSubscription = () => {
    const url = Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions";
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Screen scroll={false} testID="paywall-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ backgroundColor: theme.dark, padding: 20, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 20 }}>
          <TP color="#FFF" weight="black" size={30}>TRACEPRO</TP>
          <TP color={theme.brandSecondary} weight="bold" size={12} style={{ marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>Abonnement PRO</TP>
        </View>

        <View style={{ backgroundColor: theme.brand, padding: 18, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 16 }}>
          <TP color="#FFF" weight="black" size={22}>15 JOURS GRATUITS</TP>
          <TP color="#FFF" weight="bold" size={15} style={{ marginTop: 4 }}>puis {priceString} / mois</TP>
          <TP color="#FFF" size={12} style={{ marginTop: 8 }}>Renouvellement automatique chaque mois. Résiliable à tout moment depuis les réglages de votre compte Apple/Google. Aucun engagement.</TP>
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

        {identityError ? (
          <View testID="paywall-identity-error" style={{ backgroundColor: theme.error, padding: 12, marginBottom: 12 }}>
            <TP color="#FFF" weight="bold" size={12}>Impossible de lier votre compte pour l'achat. Reconnectez-vous puis réessayez.</TP>
          </View>
        ) : null}

        {offeringsUnavailable ? (
          <View testID="paywall-unavailable" style={{ backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 12 }}>
            <TP weight="bold">Les options d'abonnement sont indisponibles pour le moment. Réessayez plus tard.</TP>
          </View>
        ) : (
          <Btn
            label={isPurchasing ? "..." : "Commencer l'essai gratuit"}
            onPress={() => setConfirm(true)}
            disabled={isPurchasing || !identityReady}
            testID="paywall-subscribe"
          />
        )}

        <View style={{ height: 10 }} />
        <Btn label={isRestoring ? "..." : "Restaurer mes achats"} variant="ghost" onPress={doRestore} disabled={isRestoring} testID="paywall-restore" />
        <View style={{ height: 10 }} />
        <Btn label="Gérer mon abonnement" variant="ghost" onPress={manageSubscription} testID="paywall-manage" />

        {msg ? <TP color={theme.error} weight="bold" style={{ marginTop: 12 }} testID="paywall-msg">{msg}</TP> : null}

        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginTop: 8 }}>
          <Pressable onPress={() => router.push("/legal?doc=terms")} testID="paywall-terms"><TP size={12} weight="bold" color={theme.textMuted}>Conditions d'utilisation</TP></Pressable>
          <Pressable onPress={() => router.push("/legal?doc=privacy")} testID="paywall-privacy"><TP size={12} weight="bold" color={theme.textMuted}>Confidentialité</TP></Pressable>
        </View>

        <Pressable onPress={logout} testID="paywall-logout" style={{ marginTop: 20 }}>
          <TP size={12} weight="bold" color={theme.textMuted} style={{ textAlign: "center" }}>Se déconnecter</TP>
        </Pressable>

        <TP size={10} color={theme.textMuted} style={{ marginTop: 16, textAlign: "center" }}>
          Le paiement est débité sur votre compte Apple/Google à la fin des 15 jours d'essai. L'abonnement se renouvelle automatiquement sauf résiliation au moins 24 h avant la fin de la période. L'essai gratuit ne peut être utilisé qu'une seule fois par compte.
        </TP>
      </ScrollView>

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: theme.bg, borderWidth: 2, borderColor: theme.borderStrong, padding: 20 }} testID="paywall-confirm-modal">
            <TP weight="black" size={18} style={{ marginBottom: 8 }}>Confirmer l'abonnement</TP>
            <TP size={13} style={{ marginBottom: 16 }}>Essai gratuit de 15 jours, puis {priceString}/mois. Renouvellement automatique. Résiliable à tout moment.</TP>
            <Btn label={isPurchasing ? "..." : "Confirmer"} onPress={doPurchase} disabled={isPurchasing} testID="paywall-confirm" />
            <View style={{ height: 8 }} />
            <Btn label="Annuler" variant="ghost" small onPress={() => setConfirm(false)} testID="paywall-cancel" />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
