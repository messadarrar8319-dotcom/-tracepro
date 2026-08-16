import { useState, useCallback } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, TP, Header, Input, Btn, StatusPill } from "@/src/ui";
import { api, theme } from "@/src/api";

const STATUS_LABELS: Record<string, { label: string; tone: any }> = {
  ouverte: { label: "Ouverte", tone: "danger" },
  en_cours: { label: "En cours", tone: "warning" },
  resolue: { label: "Résolue", tone: "success" },
};

export default function NonConformity() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ problem_type: "", concerned_item: "", batch_number: "", description: "", corrective_action: "", responsible: "", status: "ouverte" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const l: any = await api.listNCs(); setItems(l); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!f.problem_type || !f.description) return;
    setBusy(true);
    try {
      await api.createNC(f);
      setF({ problem_type: "", concerned_item: "", batch_number: "", description: "", corrective_action: "", responsible: "", status: "ouverte" });
      await load();
    } finally { setBusy(false); }
  };

  const changeStatus = async (id: string, status: string) => {
    await api.updateNCStatus(id, status);
    await load();
  };

  return (
    <Screen scroll={false} testID="nc-screen">
      <Header title="Non-conformités" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 16 }}>
            <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase" }}>Nouvelle non-conformité</TP>
            <Input label="Type de problème*" testID="nc-type" value={f.problem_type} onChangeText={(v) => setF({ ...f, problem_type: v })} placeholder="Ex: Rupture chaîne du froid" />
            <Input label="Produit / équipement concerné" testID="nc-item" value={f.concerned_item} onChangeText={(v) => setF({ ...f, concerned_item: v })} />
            <Input label="N° de lot" testID="nc-batch" value={f.batch_number} onChangeText={(v) => setF({ ...f, batch_number: v })} autoCapitalize="characters" />
            <Input label="Description*" testID="nc-desc" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline numberOfLines={3} style={{ minHeight: 80 }} />
            <Input label="Action corrective" testID="nc-action" value={f.corrective_action} onChangeText={(v) => setF({ ...f, corrective_action: v })} />
            <Input label="Responsable" testID="nc-resp" value={f.responsible} onChangeText={(v) => setF({ ...f, responsible: v })} />
            <Btn label={busy ? "..." : "Enregistrer"} onPress={submit} disabled={busy} testID="nc-submit" />
          </View>

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Fiches ({items.length})</TP>
          {items.map((it) => {
            const s = STATUS_LABELS[it.status];
            return (
              <View key={it.id} testID={`nc-item-${it.id}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <TP weight="black" style={{ flex: 1 }}>{it.problem_type}</TP>
                  <StatusPill label={s.label} tone={s.tone} />
                </View>
                <TP size={12} color={theme.textMuted} style={{ marginTop: 4 }}>{it.description}</TP>
                {it.concerned_item ? <TP size={11} color={theme.textMuted} style={{ marginTop: 4 }}>{it.concerned_item}{it.batch_number ? ` · Lot ${it.batch_number}` : ""}</TP> : null}
                <TP size={11} color={theme.textMuted} style={{ marginTop: 4 }}>{new Date(it.created_at).toLocaleString("fr-FR")}</TP>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  {(["ouverte", "en_cours", "resolue"] as const).map((s) => (
                    <Pressable key={s} onPress={() => changeStatus(it.id, s)} testID={`nc-status-${it.id}-${s}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: it.status === s ? theme.dark : theme.bg }}>
                      <TP weight="bold" size={10} color={it.status === s ? "#FFF" : theme.text}>{STATUS_LABELS[s].label}</TP>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
