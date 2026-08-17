import React from "react";
import { View, Pressable, ScrollView } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { TP } from "@/src/ui";
import { theme } from "@/src/api";
import { useAuth } from "@/src/auth";

type Item = { label: string; icon: string; route: string; match: string[] };

const ITEMS: Item[] = [
  { label: "Tableau de bord", icon: "⌂", route: "/(tabs)", match: ["/", "/(tabs)"] },
  { label: "Recherche & traçabilité", icon: "⌕", route: "/(tabs)/search", match: ["/search"] },
  { label: "Scanner", icon: "▣", route: "/(tabs)/scan", match: ["/scan"] },
  { label: "Réceptions & lots", icon: "▦", route: "/reception/new", match: ["/reception"] },
  { label: "Températures", icon: "❄", route: "/temperature", match: ["/temperature"] },
  { label: "Nettoyage", icon: "✽", route: "/cleaning", match: ["/cleaning"] },
  { label: "Non-conformités", icon: "⚠", route: "/nonconformity", match: ["/nonconformity"] },
  { label: "Pertes", icon: "⊘", route: "/losses", match: ["/losses"] },
  { label: "Statistiques", icon: "▤", route: "/statistics", match: ["/statistics"] },
  { label: "Rappels & contrôles", icon: "◔", route: "/reminders", match: ["/reminders"] },
  { label: "Dossier de contrôle", icon: "▣", route: "/dossier", match: ["/dossier"] },
  { label: "Archives", icon: "▤", route: "/(tabs)/archives", match: ["/archives"] },
  { label: "Compte & réglages", icon: "◉", route: "/(tabs)/settings", match: ["/settings"] },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { org, user } = useAuth();

  const isActive = (item: Item) => {
    if (item.match.includes(pathname)) return true;
    return item.match.some((m) => m !== "/" && pathname.startsWith(m));
  };

  return (
    <View style={{ width: 260, backgroundColor: theme.dark, borderRightWidth: 2, borderRightColor: theme.borderStrong }} testID="web-sidebar">
      <View style={{ padding: 20, borderBottomWidth: 2, borderBottomColor: theme.borderStrong }}>
        <TP color="#FFF" weight="black" size={24}>TRACEPRO</TP>
        <TP color={theme.brandSecondary} weight="bold" size={10} style={{ marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>
          Traçabilité alimentaire
        </TP>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
        {ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Pressable
              key={item.route}
              testID={`sidebar-${item.route}`}
              onPress={() => router.push(item.route as any)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 20,
                backgroundColor: active ? theme.brand : "transparent",
                borderLeftWidth: 4,
                borderLeftColor: active ? "#FFF" : "transparent",
              }}
            >
              <TP color="#FFF" weight="black" size={16} style={{ width: 22, textAlign: "center" }}>{item.icon}</TP>
              <TP color="#FFF" weight={active ? "black" : "bold"} size={13} style={{ flex: 1 }}>{item.label}</TP>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 2, borderTopColor: theme.borderStrong }}>
        <TP color="#FFF" weight="black" size={13} numberOfLines={1}>{org?.company_name || "Mon entreprise"}</TP>
        <TP color={theme.brandSecondary} size={11} numberOfLines={1}>{user?.name} · {user?.role === "responsable" ? "Responsable" : "Employé"}</TP>
      </View>
    </View>
  );
}
