import { Tabs } from "expo-router";
import { View, Text, Platform, useWindowDimensions } from "react-native";
import { theme } from "@/src/api";
import { Sidebar } from "@/src/web/Sidebar";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
      <Text style={{ fontSize: 22, color: focused ? theme.brand : theme.textMuted }}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 900;

  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? "row" : "column", backgroundColor: theme.bg }}>
      {isDesktop ? <Sidebar /> : null}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.brand,
            tabBarInactiveTintColor: theme.textMuted,
            tabBarLabelStyle: { fontWeight: "900", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 },
            tabBarStyle: isDesktop
              ? { display: "none" }
              : {
                  backgroundColor: theme.bg,
                  borderTopWidth: 2,
                  borderTopColor: theme.borderStrong,
                  height: 70,
                  paddingTop: 6,
                },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{ title: "Accueil", tabBarIcon: ({ focused }) => <TabIcon label="⌂" focused={focused} />, tabBarButtonTestID: "tab-home" }}
          />
          <Tabs.Screen
            name="search"
            options={{ title: "Recherche", tabBarIcon: ({ focused }) => <TabIcon label="⌕" focused={focused} />, tabBarButtonTestID: "tab-search" }}
          />
          <Tabs.Screen
            name="scan"
            options={{
              title: "Scanner",
              tabBarIcon: ({ focused }) => (
                <View style={{ width: 56, height: 56, backgroundColor: focused ? theme.dark : theme.brand, borderWidth: 2, borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center", marginTop: -20 }}>
                  <Text style={{ fontSize: 26, color: "#FFF", fontWeight: "900" }}>▣</Text>
                </View>
              ),
              tabBarLabel: () => null,
              tabBarButtonTestID: "tab-scan",
            }}
          />
          <Tabs.Screen
            name="archives"
            options={{ title: "Archives", tabBarIcon: ({ focused }) => <TabIcon label="▤" focused={focused} />, tabBarButtonTestID: "tab-archives" }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: "Profil", tabBarIcon: ({ focused }) => <TabIcon label="◉" focused={focused} />, tabBarButtonTestID: "tab-settings" }}
          />
        </Tabs>
      </View>
    </View>
  );
}
