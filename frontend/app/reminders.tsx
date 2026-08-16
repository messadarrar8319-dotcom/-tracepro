import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Header, Input, Btn, Divider } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useAuth } from "@/src/auth";

const TIME_OPTIONS = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

export default function Reminders() {
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === "responsable";
  const [cfg, setCfg] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCtrl, setNewCtrl] = useState({ name: "", time: "20:00" });

  useEffect(() => {
    (async () => { try { setCfg(await api.remindersConfig()); } catch {} })();
  }, []);

  if (!cfg) return <Screen><Header title="Rappels" onBack={() => router.back()} /><View style={{ padding: 16 }}><TP>Chargement…</TP></View></Screen>;

  const toggleTempTime = (t: string) => {
    const times: string[] = cfg.temperature_times || [];
    const next = times.includes(t) ? times.filter((x) => x !== t) : [...times, t].sort();
    setCfg({ ...cfg, temperature_times: next });
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const body = {
        temperature_enabled: cfg.temperature_enabled,
        temperature_times: cfg.temperature_times,
        cleaning_enabled: cfg.cleaning_enabled,
        cleaning_time: cfg.cleaning_time,
        custom_controls: cfg.custom_controls || [],
      };
      const saved = await api.saveRemindersConfig(body);
      setCfg(saved);
      setMsg("Enregistré ✓");
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const addCustom = () => {
    if (!newCtrl.name.trim()) return;
    setCfg({ ...cfg, custom_controls: [...(cfg.custom_controls || []), { ...newCtrl }] });
    setNewCtrl({ name: "", time: "20:00" });
  };
  const removeCustom = (i: number) => {
    setCfg({ ...cfg, custom_controls: cfg.custom_controls.filter((_: any, idx: number) => idx !== i) });
  };

  return (
    <Screen scroll={false} testID="reminders-screen">
      <Header title="Rappels quotidiens" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!isManager && (
            <View style={{ backgroundColor: theme.bg2, padding: 12, marginBottom: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
              <TP size={12} weight="bold">Seul le responsable peut modifier les rappels.</TP>
            </View>
          )}

          {/* Temperature */}
          <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <TP weight="black" size={14}>Contrôle des températures</TP>
              <Pressable testID="rem-temp-toggle" disabled={!isManager} onPress={() => setCfg({ ...cfg, temperature_enabled: !cfg.temperature_enabled })} style={{ backgroundColor: cfg.temperature_enabled ? theme.success : theme.bg3, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: theme.borderStrong }}>
                <TP weight="black" size={11} color={cfg.temperature_enabled ? "#FFF" : theme.text}>{cfg.temperature_enabled ? "ACTIVÉ" : "DÉSACTIVÉ"}</TP>
              </Pressable>
            </View>
            <TP size={12} color={theme.textMuted} style={{ marginBottom: 8 }}>Nombre de contrôles attendus par jour (sélectionnez les horaires)</TP>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {TIME_OPTIONS.map((t) => {
                const on = (cfg.temperature_times || []).includes(t);
                return (
                  <Pressable key={t} testID={`rem-temp-time-${t}`} disabled={!isManager || !cfg.temperature_enabled} onPress={() => toggleTempTime(t)} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: on ? theme.dark : theme.bg, opacity: cfg.temperature_enabled ? 1 : 0.4 }}>
                    <TP weight="bold" size={12} color={on ? "#FFF" : theme.text}>{t}</TP>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Cleaning */}
          <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <TP weight="black" size={14}>Nettoyage quotidien</TP>
              <Pressable testID="rem-clean-toggle" disabled={!isManager} onPress={() => setCfg({ ...cfg, cleaning_enabled: !cfg.cleaning_enabled })} style={{ backgroundColor: cfg.cleaning_enabled ? theme.success : theme.bg3, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: theme.borderStrong }}>
                <TP weight="black" size={11} color={cfg.cleaning_enabled ? "#FFF" : theme.text}>{cfg.cleaning_enabled ? "ACTIVÉ" : "DÉSACTIVÉ"}</TP>
              </Pressable>
            </View>
            <TP size={12} color={theme.textMuted} style={{ marginBottom: 8 }}>Heure limite</TP>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {TIME_OPTIONS.map((t) => (
                <Pressable key={t} testID={`rem-clean-time-${t}`} disabled={!isManager || !cfg.cleaning_enabled} onPress={() => setCfg({ ...cfg, cleaning_time: t })} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: cfg.cleaning_time === t ? theme.dark : theme.bg, opacity: cfg.cleaning_enabled ? 1 : 0.4 }}>
                  <TP weight="bold" size={12} color={cfg.cleaning_time === t ? "#FFF" : theme.text}>{t}</TP>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Custom controls */}
          <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 16, marginBottom: 16 }}>
            <TP weight="black" size={14} style={{ marginBottom: 8 }}>Contrôles personnalisés</TP>
            {(cfg.custom_controls || []).length === 0 && <TP size={12} color={theme.textMuted} style={{ marginBottom: 8 }}>Aucun contrôle personnalisé.</TP>}
            {(cfg.custom_controls || []).map((c: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: theme.border, padding: 10, marginBottom: 6 }}>
                <TP weight="bold">{c.name} · {c.time}</TP>
                {isManager && <Pressable testID={`rem-custom-del-${i}`} onPress={() => removeCustom(i)} style={{ backgroundColor: theme.error, paddingHorizontal: 10, paddingVertical: 6 }}><TP color="#FFF" weight="black" size={11}>✕</TP></Pressable>}
              </View>
            ))}
            {isManager && (
              <View style={{ marginTop: 8 }}>
                <Input label="Nom du contrôle" testID="rem-custom-name" value={newCtrl.name} onChangeText={(v) => setNewCtrl({ ...newCtrl, name: v })} placeholder="Ex: Contrôle huile de friture" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {TIME_OPTIONS.map((t) => (
                    <Pressable key={t} onPress={() => setNewCtrl({ ...newCtrl, time: t })} style={{ borderWidth: 2, borderColor: theme.borderStrong, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: newCtrl.time === t ? theme.dark : theme.bg }}>
                      <TP weight="bold" size={11} color={newCtrl.time === t ? "#FFF" : theme.text}>{t}</TP>
                    </Pressable>
                  ))}
                </View>
                <Btn label="Ajouter le contrôle" variant="ghost" small onPress={addCustom} testID="rem-custom-add" />
              </View>
            )}
          </View>

          {isManager && <Btn label={busy ? "..." : "Enregistrer les rappels"} onPress={save} disabled={busy} testID="rem-save" />}
          {msg ? <TP style={{ marginTop: 12 }} weight="bold">{msg}</TP> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
