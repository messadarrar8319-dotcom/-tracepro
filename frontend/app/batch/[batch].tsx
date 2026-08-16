import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, TP, Header, StatusPill, Divider, Btn } from "@/src/ui";
import { api, theme } from "@/src/api";

export default function BatchDetail() {
  const { batch } = useLocalSearchParams<{ batch: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!batch) return;
    (async () => {
      try { const d = await api.batch(batch); setData(d); } catch (e: any) { setErr(e.message); }
    })();
  }, [batch]);

  const exportPdf = async () => {
    if (!batch) return;
    const url = await api.batchPdfUrl(batch);
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  const exportCsv = async () => {
    if (!batch) return;
    const url = await api.csvBatchUrl(batch);
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  if (err) return <Screen><Header title="Lot" onBack={() => router.back()} /><View style={{ padding: 16 }}><TP color={theme.error} weight="bold">{err}</TP></View></Screen>;
  if (!data) return <Screen><Header title="Lot" onBack={() => router.back()} /><View style={{ padding: 16 }}><TP>Chargement…</TP></View></Screen>;

  const r = data.receptions[0];

  return (
    <Screen scroll={false} testID="batch-screen">
      <Header title={`Lot ${batch}`} onBack={() => router.back()} right={
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable onPress={exportCsv} testID="batch-export-csv" style={{ backgroundColor: theme.success, paddingHorizontal: 10, paddingVertical: 8 }}>
            <TP color="#FFF" weight="black" size={11}>CSV</TP>
          </Pressable>
          <Pressable onPress={exportPdf} testID="batch-export-pdf" style={{ backgroundColor: theme.dark, paddingHorizontal: 10, paddingVertical: 8 }}>
            <TP color="#FFF" weight="black" size={11}>PDF</TP>
          </Pressable>
        </View>
      } />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: theme.dark, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
          <TP color={theme.brandSecondary} weight="bold" size={11} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Produit</TP>
          <TP color="#FFF" weight="black" size={22} style={{ marginTop: 4 }}>{r?.product}</TP>
          <TP color="#FFF" size={13} style={{ marginTop: 4 }}>{r?.supplier}</TP>
        </View>

        <View style={{ gap: 8, marginBottom: 16 }}>
          <Row k="N° de lot" v={data.batch_number} />
          <Row k="Référence" v={r?.reference || "-"} />
          <Row k="Réception" v={r?.reception_date} />
          <Row k="DLC / DDM" v={r?.dlc || "-"} />
          <Row k="Qté reçue" v={`${data.total_received} ${r?.unit}`} />
          <Row k="Qté restante" v={`${data.remaining} ${r?.unit}`} />
          <Row k="Température" v={r?.temperature !== null && r?.temperature !== undefined ? `${r.temperature}°C` : "-"} />
          <Row k="Conformité" v={<StatusPill label={r?.conforming ? "Conforme" : "Non conforme"} tone={r?.conforming ? "success" : "danger"} />} />
        </View>

        <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Historique</TP>
        {data.timeline.map((e: any, i: number) => (
          <View key={i} testID={`event-${i}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: e.type === "reception" ? theme.success : e.type === "perte" ? theme.warning : theme.error }}>
            <TP size={11} color={theme.textMuted} weight="bold">{e.date ? new Date(e.date).toLocaleString("fr-FR") : ""}</TP>
            <TP weight="black">{e.title}</TP>
            <TP size={12} color={theme.textMuted}>{e.detail}</TP>
            {e.user && <TP size={11} color={theme.textMuted} style={{ marginTop: 4 }}>par {e.user}</TP>}
          </View>
        ))}

        {r?.comment ? (
          <>
            <TP weight="black" size={11} style={{ textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Commentaire</TP>
            <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12 }}><TP>{r.comment}</TP></View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 8 }}>
      <TP weight="bold" size={12} style={{ width: 130, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textMuted }}>{k}</TP>
      <View style={{ flex: 1 }}>{typeof v === "string" || typeof v === "number" ? <TP weight="bold">{v}</TP> : v}</View>
    </View>
  );
}
