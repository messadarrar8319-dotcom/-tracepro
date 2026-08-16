import React from "react";
import { Text, TextProps, View, StyleSheet, Pressable, PressableProps, TextInput, TextInputProps, ScrollView } from "react-native";
import { theme } from "./api";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

export function TP({ children, style, weight = "regular", size = 14, color, ...rest }: TextProps & { weight?: "regular" | "bold" | "black"; size?: number; color?: string }) {
  const fw = weight === "black" ? "900" : weight === "bold" ? "700" : "500";
  return <Text {...rest} style={[{ fontFamily: "System", fontWeight: fw, color: color || theme.text, fontSize: size }, style]}>{children}</Text>;
}

export function Screen({ children, style, scroll = true, testID }: { children: React.ReactNode; style?: any; scroll?: boolean; testID?: string }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={[{ paddingBottom: 40 }, style]}>{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Header({ title, right, onBack, testID }: { title: string; right?: React.ReactNode; onBack?: () => void; testID?: string }) {
  return (
    <View style={styles.header} testID={testID}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.headerBtn} testID="header-back-button" hitSlop={12}>
          <TP weight="black" size={20}>{"←"}</TP>
        </Pressable>
      ) : <View style={{ width: 40 }} />}
      <TP weight="black" size={20} style={{ flex: 1 }}>{title}</TP>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function Btn({ label, onPress, variant = "primary", disabled, testID, style, small }: { label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; testID?: string; style?: any; small?: boolean }) {
  const bg = variant === "primary" ? theme.brand : variant === "danger" ? theme.error : variant === "ghost" ? "transparent" : theme.dark;
  const fg = variant === "ghost" ? theme.dark : "#FFF";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: disabled ? theme.bg3 : bg,
          borderWidth: variant === "ghost" ? 2 : 0,
          borderColor: theme.borderStrong,
          paddingVertical: small ? 12 : 16,
          paddingHorizontal: 20,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          minHeight: small ? 44 : 56,
        },
        style,
      ]}
    >
      <TP weight="black" size={small ? 14 : 16} color={fg}>{label.toUpperCase()}</TP>
    </Pressable>
  );
}

export function Input({ label, error, testID, ...rest }: TextInputProps & { label?: string; error?: string; testID?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label && <TP weight="bold" size={12} style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</TP>}
      <TextInput
        testID={testID}
        placeholderTextColor={theme.textMuted}
        {...rest}
        style={[
          {
            borderWidth: 2,
            borderColor: error ? theme.error : theme.borderStrong,
            paddingHorizontal: 14,
            paddingVertical: 14,
            fontSize: 16,
            color: theme.text,
            backgroundColor: theme.bg,
          },
          rest.style,
        ]}
      />
      {error && <TP size={12} color={theme.error} style={{ marginTop: 4 }}>{error}</TP>}
    </View>
  );
}

export function Tile({ title, value, hint, color, testID, onPress }: { title: string; value: string | number; hint?: string; color?: string; testID?: string; onPress?: () => void }) {
  const C: any = onPress ? Pressable : View;
  return (
    <C testID={testID} onPress={onPress} style={[styles.tile, color ? { backgroundColor: color } : null]}>
      <TP weight="bold" size={11} style={{ textTransform: "uppercase", letterSpacing: 0.5, color: color ? "#FFF" : theme.textMuted }}>{title}</TP>
      <TP weight="black" size={32} color={color ? "#FFF" : theme.text} style={{ marginTop: 4 }}>{value}</TP>
      {hint && <TP size={11} color={color ? "#FFF" : theme.textMuted} style={{ marginTop: 2 }}>{hint}</TP>}
    </C>
  );
}

export function ActionButton({ label, icon, onPress, testID, big }: { label: string; icon: string; onPress: () => void; testID?: string; big?: boolean }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.85 : 1, minHeight: big ? 120 : 100 }]}>
      <TP size={32} weight="black">{icon}</TP>
      <TP weight="black" size={13} style={{ marginTop: 6, textTransform: "uppercase", textAlign: "center" }}>{label}</TP>
    </Pressable>
  );
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const bg = tone === "success" ? theme.success : tone === "warning" ? theme.warning : tone === "danger" ? theme.error : theme.dark;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}>
      <TP color="#FFF" weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</TP>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 2, backgroundColor: theme.borderStrong, marginVertical: 8 }} />;
}

export function BottomBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, backgroundColor: theme.bg, borderTopWidth: 2, borderTopColor: theme.borderStrong }}>{children}</View>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: theme.borderStrong,
    backgroundColor: theme.bg,
    gap: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.borderStrong },
  tile: { flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 12, backgroundColor: theme.bg, minHeight: 90 },
  action: {
    flex: 1,
    borderWidth: 2,
    borderColor: theme.borderStrong,
    backgroundColor: theme.bg,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
