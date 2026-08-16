import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { Screen, TP, Header, Tile } from "@/src/ui";
import { api, theme } from "@/src/api";

const W = Dimensions.get("window").width;

function shortLabel(l: string) {
  // "2026-S31" -> "S31" ; "2026-08" -> "08"
  if (l.includes("-S")) return l.split("-S")[1];
  const parts = l.split("-");
  return parts[1] || l;
}

function Chart({ title, data, color, unit }: { title: string; data: { label: string; value: number }[]; color: string; unit?: string }) {
  const bars = data.map((d) => ({ value: d.value, label: shortLabel(d.label), frontColor: color }));
  const maxV = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 16 }}>
      <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase" }}>{title}</TP>
      <BarChart
        data={bars}
        barWidth={W > 500 ? 32 : 22}
        spacing={W > 500 ? 20 : 12}
        roundedTop={false}
        frontColor={color}
        yAxisThickness={1}
        xAxisThickness={2}
        xAxisColor={theme.borderStrong}
        yAxisColor={theme.borderStrong}
        noOfSections={4}
        maxValue={Math.ceil(maxV * 1.2)}
        yAxisTextStyle={{ color: theme.textMuted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: theme.textMuted, fontSize: 9 }}
        isAnimated
        height={160}
      />
      {unit ? <TP size={11} color={theme.textMuted} style={{ marginTop: 6 }}>{unit}</TP> : null}
    </View>
  );
}

export default function Statistics() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try { setStats(await api.statistics()); } catch (e: any) { setErr(e.message); }
    })();
  }, []);

  if (err) return <Screen><Header title="Statistiques" onBack={() => router.back()} /><View style={{ padding: 16 }}><TP color={theme.error} weight="bold">{err}</TP></View></Screen>;
  if (!stats) return <Screen><Header title="Statistiques" onBack={() => router.back()} /><View style={{ padding: 16 }}><TP>Chargement…</TP></View></Screen>;

  const p = period;
  const tempConf = stats.temperature_conformity;
  const pieTemp = [
    { value: tempConf.conforme || 0, color: theme.success, text: "OK" },
    { value: tempConf.non_conforme || 0, color: theme.error, text: "NC" },
  ].filter((x) => x.value > 0);
  const dlc = stats.dlc_stats;
  const pieDlc = [
    { value: dlc.ok || 0, color: theme.success },
    { value: dlc.proche || 0, color: theme.warning },
    { value: dlc.depassee || 0, color: theme.error },
    { value: dlc.sans_dlc || 0, color: theme.bg3 },
  ].filter((x) => x.value > 0);

  return (
    <Screen scroll={false} testID="statistics-screen">
      <Header title="Statistiques" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Totals */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <Tile title="Réceptions" value={stats.totals.receptions} testID="stat-total-receptions" />
          <Tile title="Lots NC" value={stats.totals.nc} />
          <Tile title="Temp." value={stats.totals.temperatures} />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <Tile title="Pertes (nb)" value={stats.totals.losses_count} />
          <Tile title="Pertes (€)" value={`${stats.totals.losses_value}€`} color={theme.error} />
        </View>

        {/* Period toggle */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {(["week", "month"] as const).map((k) => (
            <Pressable key={k} testID={`stat-period-${k}`} onPress={() => setPeriod(k)} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center", backgroundColor: period === k ? theme.dark : theme.bg }}>
              <TP weight="black" size={13} color={period === k ? "#FFF" : theme.text}>{k === "week" ? "PAR SEMAINE" : "PAR MOIS"}</TP>
            </Pressable>
          ))}
        </View>

        <Chart title={`Réceptions ${p === "week" ? "/ semaine" : "/ mois"}`} data={stats[`receptions_${p}`]} color={theme.brand} />
        <Chart title={`Pertes (€) ${p === "week" ? "/ semaine" : "/ mois"}`} data={stats[`losses_${p}`]} color={theme.error} unit="Valeur estimée en euros" />
        <Chart title={`Non-conformités ${p === "week" ? "/ semaine" : "/ mois"}`} data={stats[`nc_${p}`]} color={theme.warning} />
        <Chart title={`Contrôles température ${p === "week" ? "/ semaine" : "/ mois"}`} data={stats[`temperatures_${p}`]} color={theme.dark} />

        {/* Temperature conformity pie */}
        <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 16, alignItems: "center" }}>
          <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase", alignSelf: "flex-start" }}>Conformité températures</TP>
          {pieTemp.length ? (
            <PieChart data={pieTemp} radius={80} showText textColor="#FFF" textSize={12} />
          ) : <TP color={theme.textMuted}>Aucune donnée</TP>}
          <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
            <Legend color={theme.success} label={`Conforme: ${tempConf.conforme}`} />
            <Legend color={theme.error} label={`Non conforme: ${tempConf.non_conforme}`} />
          </View>
        </View>

        {/* DLC pie */}
        <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, alignItems: "center" }}>
          <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase", alignSelf: "flex-start" }}>Statistiques DLC (lots)</TP>
          {pieDlc.length ? (
            <PieChart data={pieDlc} radius={80} />
          ) : <TP color={theme.textMuted}>Aucune donnée</TP>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12, justifyContent: "center" }}>
            <Legend color={theme.success} label={`OK: ${dlc.ok}`} />
            <Legend color={theme.warning} label={`Proche: ${dlc.proche}`} />
            <Legend color={theme.error} label={`Dépassée: ${dlc.depassee}`} />
            <Legend color={theme.bg3} label={`Sans DLC: ${dlc.sans_dlc}`} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 14, height: 14, backgroundColor: color, borderWidth: 1, borderColor: theme.borderStrong }} />
      <TP size={12} weight="bold">{label}</TP>
    </View>
  );
}
