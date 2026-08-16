import { useState } from "react";
import { View, ScrollView, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Header, Input, StatusPill } from "@/src/ui";
import { api, theme } from "@/src/api";

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const doSearch = async (v: string) => {
    setQ(v);
    if (v.trim().length < 1) { setRes(null); return; }
    setBusy(true);
    try { const r = await api.search(v.trim()); setRes(r); } catch {}
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="search-screen">
      <Header title="Rechercher" />
      <View style={{ padding: 16 }}>
        <Input testID="search-input" placeholder="Lot, produit, fournisseur, réf, code-barres" value={q} onChangeText={doSearch} autoCapitalize="none" autoFocus />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {busy && <TP color={theme.textMuted}>Recherche…</TP>}
        {res?.batches?.length > 0 && (
          <>
            <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginVertical: 8 }}>Lots ({res.batches.length})</TP>
            {res.batches.map((b: any) => (
              <Pressable key={b.batch_number} testID={`batch-${b.batch_number}`} onPress={() => router.push(`/batch/${encodeURIComponent(b.batch_number)}`)} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6 }}>
                <TP weight="black" size={14}>{b.product}</TP>
                <TP size={12} color={theme.textMuted}>Lot {b.batch_number} · {b.supplier}</TP>
                {b.dlc && <View style={{ marginTop: 4 }}><StatusPill label={`DLC ${b.dlc}`} tone="warning" /></View>}
              </Pressable>
            ))}
          </>
        )}
        {res?.receptions?.length > 0 && (
          <>
            <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Réceptions ({res.receptions.length})</TP>
            {res.receptions.map((r: any) => (
              <Pressable key={r.id} onPress={() => router.push(`/batch/${encodeURIComponent(r.batch_number)}`)} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: r.conforming ? theme.success : theme.error }}>
                <TP weight="black">{r.product}</TP>
                <TP size={12} color={theme.textMuted}>{r.quantity}{r.unit} · {r.supplier} · Lot {r.batch_number}</TP>
              </Pressable>
            ))}
          </>
        )}
        {res && !res.batches?.length && !res.receptions?.length && (
          <View style={{ padding: 24, alignItems: "center" }} testID="search-empty"><TP color={theme.textMuted}>Aucun résultat</TP></View>
        )}
      </ScrollView>
    </Screen>
  );
}
