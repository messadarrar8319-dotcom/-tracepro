import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Input, Btn, Header } from "@/src/ui";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/api";

const TYPES = ["Boucherie", "Restaurant", "Boulangerie", "Snack", "Commerce alimentaire", "Autre"];

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [f, setF] = useState<any>({
    company_name: "", business_type: "Restaurant", manager_name: "",
    address: "", phone: "", email: "", password: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try { await register(f); } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="register-screen">
      <Header title="Créer un compte" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.brand, padding: 16, marginBottom: 20, borderWidth: 2, borderColor: theme.borderStrong }}>
            <TP color="#FFF" weight="black" size={16}>15 JOURS GRATUITS</TP>
            <TP color="#FFF" size={12} style={{ marginTop: 2 }}>Toutes les fonctionnalités. Aucune carte requise à l'inscription.</TP>
          </View>

          <Input label="Nom de l'entreprise" testID="reg-company" value={f.company_name} onChangeText={(v) => setF({ ...f, company_name: v })} placeholder="Ma Boucherie" />

          <TP weight="bold" size={12} style={{ marginBottom: 6, textTransform: "uppercase" }}>Type d'activité</TP>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {TYPES.map((t) => (
              <Pressable key={t} onPress={() => setF({ ...f, business_type: t })} testID={`reg-type-${t}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: f.business_type === t ? theme.dark : theme.bg }}>
                <TP weight="bold" size={12} color={f.business_type === t ? "#FFF" : theme.text}>{t}</TP>
              </Pressable>
            ))}
          </View>

          <Input label="Nom du responsable" testID="reg-manager" value={f.manager_name} onChangeText={(v) => setF({ ...f, manager_name: v })} placeholder="Prénom Nom" />
          <Input label="Adresse" testID="reg-address" value={f.address} onChangeText={(v) => setF({ ...f, address: v })} placeholder="1 rue de la Paix, 75001 Paris" />
          <Input label="Téléphone" testID="reg-phone" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} placeholder="0102030405" keyboardType="phone-pad" />
          <Input label="E-mail" testID="reg-email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} placeholder="vous@entreprise.fr" autoCapitalize="none" keyboardType="email-address" />
          <Input label="Mot de passe" testID="reg-password" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} placeholder="Min. 6 caractères" secureTextEntry />

          {err ? <View style={{ backgroundColor: theme.error, padding: 12, marginBottom: 12 }}><TP color="#FFF" weight="bold" testID="reg-error">{err}</TP></View> : null}

          <Btn label={busy ? "..." : "Créer mon compte"} onPress={submit} disabled={busy} testID="reg-submit-button" />
          <View style={{ height: 12 }} />
          <TP size={11} color={theme.textMuted} style={{ textAlign: "center" }}>Essai gratuit 15 jours puis 12,99 €/mois. Résiliable à tout moment.</TP>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
