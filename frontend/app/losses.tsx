import { useState, useCallback } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, TP, Header, Input, Btn, Tile } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useNetwork } from "@/src/network";

export default function Losses() {
  const router = useRouter();
  const { submit: netSubmit, online } = useNetwork();
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ product: "", batch_number: "", quantity: "", unit: "kg", reason: "", estimated_value: "", comment: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const l: any = await api.listLosses(); setItems(l); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!f.product || !f.quantity || !f.reason) return;
    setBusy(true);
    try {
      await netSubmit("loss", {
        ...f,
        quantity: parseFloat(f.quantity),
        estimated_value: f.estimated_value ? parseFloat(f.estimated_value) : null,
      });
      setF({ product: "", batch_number: "", quantity: "", unit: "kg", reason: "", estimated_value: "", comment: "" });
      await load();
    } finally { setBusy(false); }
  };

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = dayStart - 6 * 24 * 3600 * 1000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const totalDay = items.filter((i) => new Date(i.created_at).getTime() >= dayStart).reduce((a, i) => a + (i.estimated_value || 0), 0);
  const totalWeek = items.filter((i) => new Date(i.created_at).getTime() >= weekStart).reduce((a, i) => a + (i.estimated_value || 0), 0);
  const totalMonth = items.filter((i) => new Date(i.created_at).getTime() >= monthStart).reduce((a, i) => a + (i.estimated_value || 0), 0);

  return (
    <Screen scroll={false} testID="losses-screen">
      <Header title="Pertes" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Tile title="Jour" value={`${totalDay.toFixed(0)}€`} />
            <Tile title="Semaine" value={`${totalWeek.toFixed(0)}€`} />
            <Tile title="Mois" value={`${totalMonth.toFixed(0)}€`} color={theme.error} />
          </View>

          <View style={{ backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong, marginBottom: 16 }}>
            <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase" }}>Nouvelle perte</TP>
            <Input label="Produit*" testID="loss-product" value={f.product} onChangeText={(v) => setF({ ...f, product: v })} />
            <Input label="N° de lot" testID="loss-batch" value={f.batch_number} onChangeText={(v) => setF({ ...f, batch_number: v })} autoCapitalize="characters" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 2 }}><Input label="Quantité*" testID="loss-qty" value={f.quantity} onChangeText={(v) => setF({ ...f, quantity: v })} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Input label="Unité" testID="loss-unit" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} /></View>
            </View>
            <Input label="Motif*" testID="loss-reason" value={f.reason} onChangeText={(v) => setF({ ...f, reason: v })} placeholder="DLC dépassée, casse, etc." />
            <Input label="Valeur estimée (€)" testID="loss-value" value={f.estimated_value} onChangeText={(v) => setF({ ...f, estimated_value: v })} keyboardType="decimal-pad" />
            <Input label="Commentaire" testID="loss-comment" value={f.comment} onChangeText={(v) => setF({ ...f, comment: v })} />
            {!online ? <TP size={12} weight="bold" color={theme.warning} style={{ marginBottom: 8 }}>⚠ Hors ligne — enregistré localement</TP> : null}
            <Btn label={busy ? "..." : online ? "Enregistrer" : "Enregistrer (hors ligne)"} onPress={submit} disabled={busy} testID="loss-submit" />
          </View>

          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Historique ({items.length})</TP>
          {items.map((it) => (
            <View key={it.id} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: theme.warning }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <TP weight="black">{it.product}</TP>
                <TP weight="black" color={theme.error}>{it.quantity} {it.unit}</TP>
              </View>
              <TP size={12} color={theme.textMuted}>{it.reason}{it.batch_number ? ` · Lot ${it.batch_number}` : ""}</TP>
              <TP size={11} color={theme.textMuted}>{new Date(it.created_at).toLocaleString("fr-FR")} · {it.created_by_name}{it.estimated_value ? ` · ${it.estimated_value}€` : ""}</TP>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
