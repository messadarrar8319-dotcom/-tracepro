import { useEffect, useState, useCallback } from "react";
import { View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen, TP, Header, Btn, Input } from "@/src/ui";
import { api, theme } from "@/src/api";

const TYPES: [string, string][] = [
  ["receptions", "Réceptions"], ["temperatures", "Températures"],
  ["cleaning", "Nettoyage"], ["non_conformities", "Non-conformités"], ["losses", "Pertes"],
];

export default function Archives() {
  const [data, setData] = useState<any>({});
  const [year, setYear] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<string>("receptions");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ date_from: "", date_to: "", product: "", batch: "", supplier: "" });

  const load = useCallback(async () => {
    try { const r: any = await api.archives(year); setData(r); } catch {}
  }, [year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const years = [new Date().getFullYear(), new Date().getFullYear() - 1];

  const openUrl = (url: string) => {
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  const exportPdf = async (batch: string) => {
    const { url, token } = await api.batchPdfUrl(batch);
    openUrl(Platform.OS === "web" ? `${url}?token=${token}` : url);
  };

  const exportCsv = () => {
    const clean: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) clean[k] = v; });
    openUrl(api.csvUrl(tab, clean));
  };

  return (
    <Screen scroll={false} testID="archives-screen">
      <Header title="Archives (2 ans)" />
      {/* Year filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        <Pressable onPress={() => setYear(undefined)} testID="year-all" style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: year === undefined ? theme.dark : theme.bg }}><TP weight="bold" color={year === undefined ? "#FFF" : theme.text}>TOUS</TP></Pressable>
        {years.map((y) => (
          <Pressable key={y} onPress={() => setYear(y)} testID={`year-${y}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: year === y ? theme.dark : theme.bg }}><TP weight="bold" color={year === y ? "#FFF" : theme.text}>{y}</TP></Pressable>
        ))}
      </ScrollView>

      {/* Type tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
        {TYPES.map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)} testID={`arc-tab-${k}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: tab === k ? theme.brand : theme.bg }}>
            <TP weight="bold" size={12} color={tab === k ? "#FFF" : theme.text}>{label.toUpperCase()} · {data[k]?.length ?? 0}</TP>
          </Pressable>
        ))}
      </ScrollView>

      {/* CSV export bar */}
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
        <Pressable testID="csv-toggle-filters" onPress={() => setShowFilters((s) => !s)} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center", backgroundColor: showFilters ? theme.dark : theme.bg }}>
          <TP weight="black" size={12} color={showFilters ? "#FFF" : theme.text}>FILTRES {showFilters ? "▲" : "▼"}</TP>
        </Pressable>
        <Pressable testID="csv-export" onPress={exportCsv} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center", backgroundColor: theme.success }}>
          <TP weight="black" size={12} color="#FFF">EXPORTER CSV</TP>
        </Pressable>
      </View>

      {showFilters && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label="Du" testID="csv-date-from" value={filters.date_from} onChangeText={(v) => setFilters({ ...filters, date_from: v })} placeholder="YYYY-MM-DD" /></View>
            <View style={{ flex: 1 }}><Input label="Au" testID="csv-date-to" value={filters.date_to} onChangeText={(v) => setFilters({ ...filters, date_to: v })} placeholder="YYYY-MM-DD" /></View>
          </View>
          <Input label="Produit" testID="csv-product" value={filters.product} onChangeText={(v) => setFilters({ ...filters, product: v })} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Input label="Lot" testID="csv-batch" value={filters.batch} onChangeText={(v) => setFilters({ ...filters, batch: v })} /></View>
            <View style={{ flex: 1 }}><Input label="Fournisseur" testID="csv-supplier" value={filters.supplier} onChangeText={(v) => setFilters({ ...filters, supplier: v })} /></View>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {(data[tab] || []).length === 0 && <TP color={theme.textMuted}>Aucun enregistrement.</TP>}
        {(data[tab] || []).map((it: any) => (
          <View key={it.id} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6 }}>
            <TP weight="black" size={13}>
              {tab === "receptions" && `${it.product} · Lot ${it.batch_number}`}
              {tab === "temperatures" && `${it.zone} · ${it.temperature}°C`}
              {tab === "cleaning" && `${it.zone} · ${it.operation_type}`}
              {tab === "non_conformities" && `${it.problem_type}`}
              {tab === "losses" && `${it.product} · ${it.quantity}${it.unit}`}
            </TP>
            <TP size={11} color={theme.textMuted} style={{ marginTop: 2 }}>{new Date(it.created_at).toLocaleString("fr-FR")} · {it.created_by_name}</TP>
            {tab === "receptions" && (
              <Pressable onPress={() => exportPdf(it.batch_number)} testID={`export-${it.id}`} style={{ marginTop: 8, backgroundColor: theme.dark, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" }}>
                <TP color="#FFF" weight="bold" size={11}>EXPORTER PDF</TP>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
