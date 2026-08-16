import { useState } from "react";
import { View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Input, Btn, Header } from "@/src/ui";
import { api, theme } from "@/src/api";

export default function Forgot() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"ask" | "reset">("ask");
  const [devToken, setDevToken] = useState("");
  const [token, setToken] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true); setMsg("");
    try {
      const r: any = await api.forgot(email.trim());
      if (r.dev_token) setDevToken(r.dev_token);
      setStep("reset");
      setMsg("Si le compte existe, un lien de réinitialisation a été envoyé. Utilisez le jeton ci-dessous pour tester.");
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true); setMsg("");
    try {
      await api.resetPassword(token || devToken, newPwd);
      setMsg("Mot de passe réinitialisé. Vous pouvez vous connecter.");
      setTimeout(() => router.replace("/(auth)/login"), 1200);
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen testID="forgot-screen">
      <Header title="Mot de passe oublié" onBack={() => router.back()} />
      <View style={{ padding: 20 }}>
        {step === "ask" ? (
          <>
            <TP style={{ marginBottom: 16 }}>Entrez votre e-mail pour recevoir un jeton de réinitialisation.</TP>
            <Input label="E-mail" testID="forgot-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Btn label={busy ? "..." : "Envoyer"} onPress={request} disabled={busy} testID="forgot-submit" />
          </>
        ) : (
          <>
            {devToken ? (
              <View style={{ backgroundColor: theme.dark, padding: 12, marginBottom: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
                <TP color={theme.brandSecondary} weight="bold" size={11}>JETON (mode démo)</TP>
                <TP color="#FFF" weight="bold" size={12} selectable style={{ marginTop: 4 }}>{devToken}</TP>
              </View>
            ) : null}
            <Input label="Jeton" testID="forgot-token" value={token} onChangeText={setToken} placeholder="Collez le jeton reçu" />
            <Input label="Nouveau mot de passe" testID="forgot-new" secureTextEntry value={newPwd} onChangeText={setNewPwd} />
            <Btn label={busy ? "..." : "Réinitialiser"} onPress={reset} disabled={busy} testID="forgot-reset" />
          </>
        )}
        {msg ? <TP style={{ marginTop: 16 }} weight="bold">{msg}</TP> : null}
      </View>
    </Screen>
  );
}
