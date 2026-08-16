import { useEffect, useState, useCallback } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, TP, Header, Input, Btn, StatusPill } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useNetwork } from "@/src/network";
import { useAuth } from "@/src/auth";

const ZONES = ["Chambre froide", "Congélateur", "Vitrine", "Réserve", "Autre"];

export default function Temperature() {
  const router = useRouter();
  const { submit: netSubmit, online } = useNetwork();
  const { user } = useAuth();
  const isManager = user?.role === "responsable";
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ zone: "", zone_type: "chambre_froide", temperature: "", conforming: true, comment: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { const l: any = await api.listTemps(); setItems(l); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setErr("");
    if (!f.zone || !f.temperature) { setErr("Zone et température requises"); return; }
    setBusy(true);
    try {
      await netSubmit("temperature", { ...f, temperature: parseFloat(f.temperature) });
      setF({ zone: "", zone_type: f.zone_type, temperature: "", conforming: true, comment: "" });
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="temperature-screen">
      <Header title="Températures" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 16 }}>
            <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase" }}>Nouveau contrôle</TP>

            <TP weight="bold" size={12} style={{ marginBottom: 6, textTransform: "uppercase" }}>Type de zone</TP>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
              {ZONES.map((z) => {
                const key = z.toLowerCase().replace(/[^a-z]/g, "_");
                return (
                  <Pressable key={z} testID={`temp-zone-${key}`} onPress={() => setF({ ...f, zone_type: key })} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: f.zone_type === key ? theme.dark : theme.bg }}>
                    <TP weight="bold" size={12} color={f.zone_type === key ? "#FFF" : theme.text}>{z}</TP>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Input label="Nom de la zone" testID="temp-zone-name" value={f.zone} onChangeText={(v) => setF({ ...f, zone: v })} placeholder="Ex: Chambre froide n°1" />
            <Input label="Température (°C)" testID="temp-value" value={f.temperature} onChangeText={(v) => setF({ ...f, temperature: v })} keyboardType="numbers-and-punctuation" />

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <Pressable testID="temp-conform-yes" onPress={() => setF({ ...f, conforming: true })} style={{ flex: 1, backgroundColor: f.conforming ? theme.success : theme.bg, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center" }}>
                <TP weight="black" size={12} color={f.conforming ? "#FFF" : theme.text}>CONFORME</TP>
              </Pressable>
              <Pressable testID="temp-conform-no" onPress={() => setF({ ...f, conforming: false })} style={{ flex: 1, backgroundColor: !f.conforming ? theme.error : theme.bg, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center" }}>
                <TP weight="black" size={12} color={!f.conforming ? "#FFF" : theme.text}>NON CONFORME</TP>
              </Pressable>
            </View>

            <Input label="Commentaire" testID="temp-comment" value={f.comment} onChangeText={(v) => setF({ ...f, comment: v })} />
            {err ? <TP color={theme.error} weight="bold">{err}</TP> : null}
            {!online ? <TP size={12} weight="bold" color={theme.warning} style={{ marginBottom: 8 }}>⚠ Hors ligne — enregistré localement</TP> : null}
            <Btn label={busy ? "..." : online ? "Enregistrer" : "Enregistrer (hors ligne)"} onPress={submit} disabled={busy} testID="temp-submit" />
          </View>

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Historique ({items.length})</TP>
          {items.length === 0 && <TP color={theme.textMuted}>Aucun enregistrement.</TP>}
          {items.map((it) => {
            const d = new Date(it.created_at);
            return (
            <View key={it.id} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: it.conforming ? theme.success : theme.error }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <TP weight="black">{it.zone}</TP>
                <TP weight="black" size={18} color={it.conforming ? theme.success : theme.error}>{it.temperature}°C</TP>
              </View>
              {it.comment ? <TP size={12} style={{ marginTop: 4 }}>{it.comment}</TP> : null}
              <View style={{ backgroundColor: theme.bg2, padding: 8, marginTop: 8, borderWidth: 1, borderColor: theme.border }}>
                <TP size={11} weight="bold" testID={`temp-signature-${it.id}`}>✔ Contrôle effectué par {it.created_by_name} — {d.toLocaleDateString("fr-FR")} à {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</TP>
                {it.corrected ? <TP size={10} color={theme.warning} weight="bold" style={{ marginTop: 2 }}>⚠ Corrigé par {it.corrected_by_name}</TP> : null}
              </View>
              {isManager && (
                <Pressable testID={`temp-correct-${it.id}`} onPress={() => router.push({ pathname: "/correct", params: { ctype: "temperatures", cid: it.id, label: `${it.zone} · ${it.temperature}°C`, fields: "temperature,conforming,comment" } })} style={{ marginTop: 8, alignSelf: "flex-start", borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <TP weight="bold" size={11}>CORRIGER</TP>
                </Pressable>
              )}
            </View>
          );})}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
