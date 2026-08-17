import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Btn } from "@/src/ui";
import { theme } from "@/src/api";

export default function BillingCanceled() {
  const router = useRouter();
  return (
    <Screen scroll={false} testID="billing-canceled-screen">
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: theme.warning, width: 72, height: 72, borderWidth: 2, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center" }}>
          <TP color="#FFF" weight="black" size={36}>!</TP>
        </View>
        <TP weight="black" size={22} style={{ marginTop: 20, textAlign: "center" }}>Paiement annulé</TP>
        <TP size={13} color={theme.textMuted} style={{ marginTop: 8, textAlign: "center" }}>
          Vous n'avez pas été débité. Vous pouvez réessayer à tout moment pour démarrer votre essai gratuit.
        </TP>
        <View style={{ height: 20 }} />
        <Btn label="Revenir à l'abonnement" onPress={() => router.replace("/billing")} testID="canceled-retry" />
      </View>
    </Screen>
  );
}
