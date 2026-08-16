import { useState } from "react";
import { View, KeyboardAvoidingView, Platform, Image, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Input, Btn } from "@/src/ui";
import { useAuth } from "@/src/auth";
import { theme } from "@/src/api";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try { await login(email.trim(), password); } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="login-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.dark, padding: 20, marginBottom: 24, borderWidth: 2, borderColor: theme.borderStrong }}>
            <TP color="#FFF" weight="black" size={36}>TRACEPRO</TP>
            <TP color={theme.brandSecondary} weight="bold" size={12} style={{ marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>Traçabilité pro · HACCP</TP>
          </View>

          <TP weight="black" size={22} style={{ marginBottom: 20 }}>Connexion</TP>

          <Input label="E-mail" testID="login-email-input" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vous@entreprise.fr" />
          <Input label="Mot de passe" testID="login-password-input" secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" />

          {err ? <View style={{ backgroundColor: theme.error, padding: 12, marginBottom: 12 }}><TP color="#FFF" weight="bold" testID="login-error">{err}</TP></View> : null}

          <Btn label={busy ? "..." : "Se connecter"} onPress={submit} disabled={busy} testID="login-submit-button" />

          <View style={{ height: 12 }} />
          <Pressable onPress={() => router.push("/(auth)/forgot")} testID="login-forgot-link"><TP weight="bold" color={theme.brand} style={{ textAlign: "center", padding: 12 }}>Mot de passe oublié ?</TP></Pressable>

          <View style={{ height: 24 }} />
          <View style={{ height: 2, backgroundColor: theme.borderStrong }} />
          <View style={{ height: 20 }} />
          <TP style={{ textAlign: "center", marginBottom: 12 }}>Pas encore de compte ?</TP>
          <Btn label="Créer un compte" variant="ghost" onPress={() => router.push("/(auth)/register")} testID="login-goto-register" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
