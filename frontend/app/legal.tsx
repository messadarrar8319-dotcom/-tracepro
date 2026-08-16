import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, TP, Header } from "@/src/ui";
import { theme } from "@/src/api";

const TERMS = `TRACEPRO — Conditions d'utilisation (EULA)

Abonnement : TRACEPRO PRO.
Prix : 12,99 € par mois (TTC), débité via votre compte Apple (App Store) ou Google (Play Store).
Essai gratuit : 15 jours. L'essai gratuit est limité à une seule utilisation par identifiant Apple/Google. Si vous avez déjà bénéficié de l'essai, vous serez débité immédiatement.

Renouvellement automatique :
- L'abonnement est reconduit automatiquement pour une nouvelle période d'un mois, sauf résiliation au moins 24 heures avant la fin de la période en cours.
- Le montant du renouvellement est prélevé dans les 24 heures précédant la fin de la période.

Gestion et résiliation :
- Vous pouvez gérer ou résilier votre abonnement à tout moment dans les réglages de votre compte Apple (Réglages → votre nom → Abonnements) ou Google Play (Abonnements).
- La résiliation prend effet à la fin de la période payée en cours ; aucun remboursement au prorata n'est effectué pour la période entamée.

Données :
- En cas d'expiration ou de résiliation de l'abonnement, vos données de traçabilité sont conservées et restent accessibles après réactivation de l'abonnement.

Contact : support@tracepro.app`;

const PRIVACY = `TRACEPRO — Politique de confidentialité

Données collectées :
- Compte : nom, e-mail, entreprise, rôle.
- Données métier saisies : réceptions, lots, températures, nettoyages, non-conformités, pertes, photos.

Utilisation :
- Fournir le service de traçabilité et respecter vos obligations d'hygiène (HACCP).
- Les données appartiennent à votre entreprise et sont isolées par entreprise.

Achats :
- Les abonnements sont gérés par Apple/Google et RevenueCat. Nous ne stockons pas vos informations de carte bancaire.

Conservation :
- Les archives sont conservées 2 ans, conformément aux obligations légales applicables.

Vos droits :
- Vous pouvez demander l'accès, la rectification ou la suppression de vos données à support@tracepro.app.

Sécurité :
- Connexion sécurisée, mots de passe chiffrés, accès restreint par rôle.`;

export default function Legal() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const isPrivacy = doc === "privacy";
  return (
    <Screen scroll={false} testID="legal-screen">
      <Header title={isPrivacy ? "Confidentialité" : "Conditions d'utilisation"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 16 }}>
          <TP size={13} style={{ lineHeight: 20 }}>{isPrivacy ? PRIVACY : TERMS}</TP>
        </View>
      </ScrollView>
    </Screen>
  );
}
