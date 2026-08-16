import { useState, useCallback } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, TP, Header, Input, Btn, StatusPill } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useNetwork } from "@/src/network";

const ZONES = ["Plan de travail", "Chambre froide", "Machine", "Ustensiles", "Vitrine", "Sol", "Autre"];

export default function Cleaning() {
  const router = useRouter();
  const { submit: netSubmit, online } = useNetwork();
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ zone: ZONES[0], operation_type: "Nettoyage + désinfection", status: "termine", comment: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const l: any = await api.listCleaning(); setItems(l); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    try { await netSubmit("cleaning", f); await load(); }
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="cleaning-screen">
      <Header title="Nettoyage & désinfection" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 16 }}>
            <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase" }}>Nouvelle opération</TP>
            <TP weight="bold" size={12} style={{ marginBottom: 6, textTransform: "uppercase" }}>Zone</TP>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {ZONES.map((z) => (
                <Pressable key={z} testID={`clean-zone-${z}`} onPress={() => setF({ ...f, zone: z })} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: f.zone === z ? theme.dark : theme.bg }}>
                  <TP weight="bold" size={12} color={f.zone === z ? "#FFF" : theme.text}>{z}</TP>
                </Pressable>
              ))}
            </ScrollView>
            <Input label="Type d'opération" testID="clean-op" value={f.operation_type} onChangeText={(v) => setF({ ...f, operation_type: v })} />
            <Input label="Commentaire" testID="clean-comment" value={f.comment} onChangeText={(v) => setF({ ...f, comment: v })} />
            {!online ? <TP size={12} weight="bold" color={theme.warning} style={{ marginBottom: 8 }}>⚠ Hors ligne — enregistré localement</TP> : null}
            <Btn label={busy ? "..." : online ? "Enregistrer" : "Enregistrer (hors ligne)"} onPress={submit} disabled={busy} testID="clean-submit" />
          </View>

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Historique ({items.length})</TP>
          {items.map((it) => (
            <View key={it.id} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: theme.success }}>
              <TP weight="black">{it.zone} · {it.operation_type}</TP>
              <TP size={11} color={theme.textMuted}>{new Date(it.created_at).toLocaleString("fr-FR")} · {it.created_by_name}</TP>
              {it.comment ? <TP size={12} style={{ marginTop: 4 }}>{it.comment}</TP> : null}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
