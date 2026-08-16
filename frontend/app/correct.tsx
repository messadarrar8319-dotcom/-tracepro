import { useEffect, useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen, TP, Header, Input, Btn } from "@/src/ui";
import { api, theme } from "@/src/api";

export default function Correct() {
  const router = useRouter();
  const { ctype, cid, label, fields } = useLocalSearchParams<{ ctype: string; cid: string; label: string; fields: string }>();
  const fieldList = (fields || "").split(",").filter(Boolean);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [conforming, setConforming] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAudit = async () => {
    try { setAudit(await api.controlAudit(ctype!, cid!)); } catch {}
  };
  useEffect(() => { loadAudit(); }, [ctype, cid]);

  const submit = async () => {
    setMsg("");
    if (!reason.trim()) { setMsg("Le motif de correction est obligatoire"); return; }
    const payload: Record<string, any> = {};
    for (const f of fieldList) {
      if (f === "conforming") {
        if (conforming !== null) payload.conforming = conforming;
      } else if (f === "temperature") {
        if (changes.temperature) payload.temperature = parseFloat(changes.temperature);
      } else if (changes[f] !== undefined && changes[f] !== "") {
        payload[f] = changes[f];
      }
    }
    if (Object.keys(payload).length === 0) { setMsg("Indiquez au moins une valeur à corriger"); return; }
    setBusy(true);
    try {
      await api.correctControl(ctype!, cid!, payload, reason.trim());
      setMsg("Correction enregistrée ✓ (historique conservé)");
      setReason(""); setChanges({}); setConforming(null);
      await loadAudit();
      setTimeout(() => router.back(), 1200);
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="correct-screen">
      <Header title="Corriger le contrôle" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.bg2, padding: 12, marginBottom: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
            <TP weight="bold" size={12}>{label}</TP>
            <TP size={11} color={theme.textMuted} style={{ marginTop: 4 }}>Le contrôle initial reste conservé. Toute correction crée un historique d'audit.</TP>
          </View>

          {fieldList.includes("temperature") && (
            <Input label="Nouvelle température (°C)" testID="correct-temperature" value={changes.temperature || ""} onChangeText={(v) => setChanges({ ...changes, temperature: v })} keyboardType="numbers-and-punctuation" />
          )}
          {fieldList.includes("operation_type") && (
            <Input label="Type d'opération" testID="correct-operation" value={changes.operation_type || ""} onChangeText={(v) => setChanges({ ...changes, operation_type: v })} />
          )}
          {fieldList.includes("status") && (
            <Input label="Statut" testID="correct-status" value={changes.status || ""} onChangeText={(v) => setChanges({ ...changes, status: v })} />
          )}
          {fieldList.includes("conforming") && (
            <View style={{ marginBottom: 16 }}>
              <TP weight="bold" size={12} style={{ marginBottom: 6, textTransform: "uppercase" }}>Conformité</TP>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable testID="correct-conform-yes" onPress={() => setConforming(true)} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center", backgroundColor: conforming === true ? theme.success : theme.bg }}><TP weight="black" size={12} color={conforming === true ? "#FFF" : theme.text}>CONFORME</TP></Pressable>
                <Pressable testID="correct-conform-no" onPress={() => setConforming(false)} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center", backgroundColor: conforming === false ? theme.error : theme.bg }}><TP weight="black" size={12} color={conforming === false ? "#FFF" : theme.text}>NON CONFORME</TP></Pressable>
              </View>
            </View>
          )}
          {fieldList.includes("comment") && (
            <Input label="Commentaire" testID="correct-comment" value={changes.comment || ""} onChangeText={(v) => setChanges({ ...changes, comment: v })} />
          )}

          <Input label="Motif de la correction *" testID="correct-reason" value={reason} onChangeText={setReason} placeholder="Ex: erreur de saisie" />
          <Btn label={busy ? "..." : "Enregistrer la correction"} onPress={submit} disabled={busy} testID="correct-submit" />
          {msg ? <TP style={{ marginTop: 12 }} weight="bold">{msg}</TP> : null}

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>Historique des corrections ({audit.length})</TP>
          {audit.length === 0 && <TP color={theme.textMuted}>Aucune correction.</TP>}
          {audit.map((a) => (
            <View key={a.id} testID={`audit-${a.id}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: theme.warning }}>
              <TP weight="bold" size={12}>{new Date(a.changed_at).toLocaleString("fr-FR")} · {a.changed_by_name}</TP>
              <TP size={12} color={theme.textMuted} style={{ marginTop: 2 }}>Motif : {a.reason}</TP>
              <TP size={11} style={{ marginTop: 4 }}>Avant : {JSON.stringify(a.old_values)}</TP>
              <TP size={11}>Après : {JSON.stringify(a.new_values)}</TP>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
