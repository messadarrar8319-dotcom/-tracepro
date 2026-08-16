import { useEffect, useState, useCallback } from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, TP, Tile, ActionButton, Divider, StatusPill } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function Home() {
  const router = useRouter();
  const { user, org, subscription, refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.dashboard(); setData(d); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));

  const onRefresh = async () => { setRefreshing(true); await load(); await refresh(); setRefreshing(false); };

  const notifs = data?.notifications || [];

  return (
    <Screen scroll={false} testID="home-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}>
        {/* Header */}
        <View style={{ backgroundColor: theme.dark, padding: 20, borderBottomWidth: 2, borderBottomColor: theme.borderStrong }}>
          <TP color={theme.brandSecondary} weight="bold" size={11} style={{ letterSpacing: 1, textTransform: "uppercase" }}>Tableau de bord</TP>
          <TP color="#FFF" weight="black" size={26} style={{ marginTop: 2 }}>{org?.company_name || "TRACEPRO"}</TP>
          <View style={{ flexDirection: "row", marginTop: 10, gap: 8, alignItems: "center" }}>
            <StatusPill label={subscription?.state === "essai" ? `Essai · ${subscription?.days_left ?? "-"}j` : subscription?.state === "actif" ? "Abonné" : subscription?.state === "expire" ? "Expiré" : "—"} tone={subscription?.state === "actif" ? "success" : subscription?.state === "essai" ? "warning" : "danger"} />
            <TP color="#FFF" size={11}>{user?.name} · {user?.role === "responsable" ? "Responsable" : "Employé"}</TP>
          </View>
        </View>

        {/* KPI Tiles */}
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Tile testID="kpi-receptions-today" title="Réceptions" value={data?.receptions_today ?? 0} hint="Aujourd'hui" />
            <Tile testID="kpi-active-batches" title="Lots actifs" value={data?.active_batches ?? 0} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Tile testID="kpi-dlc-soon" title="DLC proches" value={data?.dlc_soon ?? 0} color={data?.dlc_soon ? theme.warning : undefined} />
            <Tile testID="kpi-dlc-expired" title="DLC dépassées" value={data?.dlc_expired ?? 0} color={data?.dlc_expired ? theme.error : undefined} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Tile testID="kpi-temp-nc" title="Temp. NC" value={data?.temp_non_conformes ?? 0} color={data?.temp_non_conformes ? theme.error : undefined} />
            <Tile testID="kpi-nc" title="NC ouvertes" value={data?.non_conformites_open ?? 0} color={data?.non_conformites_open ? theme.warning : undefined} />
          </View>
        </View>

        {/* Big Actions */}
        <View style={{ paddingHorizontal: 16 }}>
          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Actions rapides</TP>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <ActionButton testID="action-new-reception" label="Nouvelle réception" icon="＋" onPress={() => router.push("/reception/new")} big />
            <ActionButton testID="action-scan" label="Scanner" icon="▣" onPress={() => router.push("/(tabs)/scan")} big />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <ActionButton testID="action-temperatures" label="Températures" icon="❄" onPress={() => router.push("/temperature")} />
            <ActionButton testID="action-cleaning" label="Nettoyage" icon="✦" onPress={() => router.push("/cleaning")} />
            <ActionButton testID="action-nc" label="Non-conformité" icon="!" onPress={() => router.push("/nonconformity")} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionButton testID="action-losses" label="Pertes" icon="✕" onPress={() => router.push("/losses")} />
            <ActionButton testID="action-search" label="Recherche" icon="⌕" onPress={() => router.push("/(tabs)/search")} />
            <ActionButton testID="action-archives" label="Archives" icon="▤" onPress={() => router.push("/(tabs)/archives")} />
          </View>
        </View>

        {/* Notifications */}
        <View style={{ padding: 16 }}>
          <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notifications</TP>
          {notifs.length === 0 ? (
            <View style={{ backgroundColor: theme.success, padding: 16, borderWidth: 2, borderColor: theme.borderStrong }} testID="notifs-empty">
              <TP color="#FFF" weight="black" size={16}>TOUT EST EN ORDRE ✓</TP>
              <TP color="#FFF" size={12} style={{ marginTop: 4 }}>Aucune alerte en cours.</TP>
            </View>
          ) : notifs.map((n: any, i: number) => (
            <View key={i} testID={`notif-${i}`} style={{ borderWidth: 2, borderColor: theme.borderStrong, backgroundColor: theme.bg, padding: 12, marginBottom: 6, borderLeftWidth: 8, borderLeftColor: n.type === "danger" ? theme.error : theme.warning }}>
              <TP weight="black" size={13}>{n.title}</TP>
              <TP size={12} color={theme.textMuted}>{n.detail}</TP>
            </View>
          ))}
        </View>

        {/* Stats mini */}
        {data && (
          <View style={{ padding: 16 }}>
            <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>7 derniers jours</TP>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Tile title="Réceptions" value={data.week.receptions} />
              <Tile title="Temp." value={data.week.temperatures} />
              <Tile title="Pertes" value={data.week.losses} />
              <Tile title="NC" value={data.week.nc} />
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
