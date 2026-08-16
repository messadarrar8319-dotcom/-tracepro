import { useState } from "react";
import { View, ScrollView, Pressable, Platform, Linking, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Header, Input, Btn } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useAuth } from "@/src/auth";

const SECTIONS: [string, string][] = [
  ["temperatures", "Températures"],
  ["cleaning", "Nettoyage"],
  ["non_conformities", "Non-conformités"],
  ["receptions", "Réceptions"],
  ["traceability", "Traçabilité des lots"],
  ["losses", "Pertes"],
];

export default function Dossier() {
  const router = useRouter();
  const { user, org } = useAuth();
  const isManager = user?.role === "responsable";
  const [selected, setSelected] = useState<string[]>(SECTIONS.map((s) => s[0]));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");

  const toggle = (k: string) => {
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  };

  const generate = async () => {
    setMsg("");
    if (selected.length === 0) { setMsg("Sélectionnez au moins une section"); return; }
    const filters: Record<string, string> = { sections: selected.join(",") };
    if (from) filters.date_from = from;
    if (to) filters.date_to = to;
    const url = await api.dossierUrl(filters);
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
    setMsg("Dossier généré ✓");
  };

  if (!isManager) {
    return (
      <Screen testID="dossier-screen">
        <Header title="Dossier de contrôle" onBack={() => router.back()} />
        <View style={{ padding: 16 }}><TP weight="bold">Réservé au responsable.</TP></View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} testID="dossier-screen">
      <Header title="Dossier de contrôle" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.dark, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
            <TP color={theme.brandSecondary} weight="bold" size={11} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Générer le dossier</TP>
            <TP color="#FFF" weight="black" size={18} style={{ marginTop: 4 }}>{org?.company_name}</TP>
            <TP color="#FFF" size={12} style={{ marginTop: 2 }}>Un seul PDF regroupant les sections choisies pour un contrôle sanitaire.</TP>
          </View>

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Période (optionnelle)</TP>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label="Du" testID="dossier-from" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
            <View style={{ flex: 1 }}><Input label="Au" testID="dossier-to" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
          </View>

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Sections à inclure</TP>
          <View style={{ gap: 8, marginBottom: 16 }}>
            {SECTIONS.map(([k, label]) => {
              const on = selected.includes(k);
              return (
                <Pressable key={k} testID={`dossier-sec-${k}`} onPress={() => toggle(k)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 2, borderColor: theme.borderStrong, padding: 14, backgroundColor: on ? theme.brand : theme.bg }}>
                  <TP weight="black" size={14} color={on ? "#FFF" : theme.text}>{label}</TP>
                  <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: on ? "#FFF" : theme.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: on ? "#FFF" : theme.bg }}>
                    {on ? <TP weight="black" size={14} color={theme.brand}>✓</TP> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Btn label="Générer le dossier PDF" onPress={generate} testID="dossier-generate" />
          {msg ? <TP style={{ marginTop: 12 }} weight="bold">{msg}</TP> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
