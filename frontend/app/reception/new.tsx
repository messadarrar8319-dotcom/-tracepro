import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Screen, TP, Header, Input, Btn, BottomBar } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useNetwork } from "@/src/network";

export default function NewReception() {
  const router = useRouter();
  const { submit: netSubmit, online } = useNetwork();
  const params = useLocalSearchParams<{ barcode?: string }>();
  const [f, setF] = useState<any>({
    supplier: "", product: "", reference: "", batch_number: "",
    reception_date: new Date().toISOString().slice(0, 10),
    dlc: "", quantity: "", unit: "kg", temperature: "",
    conforming: true, comment: "", label_photo: "", delivery_photo: "",
    barcode: params.barcode || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (field: "label_photo" | "delivery_photo") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    try {
      const up = await api.uploadFile(a.uri, a.fileName || "photo.jpg", a.mimeType || "image/jpeg");
      setF({ ...f, [field]: up.path });
    } catch (e: any) { setErr("Upload: " + e.message); }
  };

  const submit = async () => {
    setErr("");
    if (!f.supplier || !f.product || !f.batch_number || !f.quantity) {
      setErr("Fournisseur, produit, lot et quantité sont obligatoires");
      return;
    }
    setBusy(true);
    try {
      const body = {
        ...f,
        quantity: parseFloat(f.quantity),
        temperature: f.temperature ? parseFloat(f.temperature) : null,
      };
      const res = await netSubmit("reception", body);
      if (res.queued) {
        router.replace("/(tabs)");
      } else {
        router.replace(`/batch/${encodeURIComponent(f.batch_number)}`);
      }
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen scroll={false} testID="reception-new-screen">
      <Header title="Nouvelle réception" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Input label="Fournisseur*" testID="rec-supplier" value={f.supplier} onChangeText={(v) => setF({ ...f, supplier: v })} />
          <Input label="Produit*" testID="rec-product" value={f.product} onChangeText={(v) => setF({ ...f, product: v })} />
          <Input label="Référence" testID="rec-reference" value={f.reference} onChangeText={(v) => setF({ ...f, reference: v })} />
          <Input label="N° de lot*" testID="rec-batch" value={f.batch_number} onChangeText={(v) => setF({ ...f, batch_number: v })} autoCapitalize="characters" />
          <Input label="Code-barres" testID="rec-barcode" value={f.barcode} onChangeText={(v) => setF({ ...f, barcode: v })} autoCapitalize="characters" />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input label="Date réception" testID="rec-date" value={f.reception_date} onChangeText={(v) => setF({ ...f, reception_date: v })} placeholder="YYYY-MM-DD" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="DLC / DDM" testID="rec-dlc" value={f.dlc} onChangeText={(v) => setF({ ...f, dlc: v })} placeholder="YYYY-MM-DD" />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 2 }}>
              <Input label="Quantité*" testID="rec-qty" value={f.quantity} onChangeText={(v) => setF({ ...f, quantity: v })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Unité" testID="rec-unit" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} />
            </View>
          </View>

          <Input label="Température (°C)" testID="rec-temp" value={f.temperature} onChangeText={(v) => setF({ ...f, temperature: v })} keyboardType="numbers-and-punctuation" />

          <TP weight="bold" size={12} style={{ textTransform: "uppercase", marginBottom: 6 }}>Conformité</TP>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Pressable testID="rec-conform-yes" onPress={() => setF({ ...f, conforming: true })} style={{ flex: 1, backgroundColor: f.conforming ? theme.success : theme.bg, borderWidth: 2, borderColor: theme.borderStrong, padding: 14, alignItems: "center" }}>
              <TP weight="black" color={f.conforming ? "#FFF" : theme.text}>CONFORME</TP>
            </Pressable>
            <Pressable testID="rec-conform-no" onPress={() => setF({ ...f, conforming: false })} style={{ flex: 1, backgroundColor: !f.conforming ? theme.error : theme.bg, borderWidth: 2, borderColor: theme.borderStrong, padding: 14, alignItems: "center" }}>
              <TP weight="black" color={!f.conforming ? "#FFF" : theme.text}>NON CONFORME</TP>
            </Pressable>
          </View>

          <Input label="Commentaire" testID="rec-comment" value={f.comment} onChangeText={(v) => setF({ ...f, comment: v })} multiline numberOfLines={3} style={{ minHeight: 80 }} />

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <Pressable testID="rec-photo-label" onPress={() => pick("label_photo")} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 20, alignItems: "center", backgroundColor: f.label_photo ? theme.success : theme.bg }}>
              <TP weight="black" size={28} color={f.label_photo ? "#FFF" : theme.text}>{f.label_photo ? "✓" : "＋"}</TP>
              <TP weight="bold" size={11} color={f.label_photo ? "#FFF" : theme.text} style={{ textAlign: "center", marginTop: 4 }}>PHOTO ÉTIQUETTE</TP>
            </Pressable>
            <Pressable testID="rec-photo-delivery" onPress={() => pick("delivery_photo")} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 20, alignItems: "center", backgroundColor: f.delivery_photo ? theme.success : theme.bg }}>
              <TP weight="black" size={28} color={f.delivery_photo ? "#FFF" : theme.text}>{f.delivery_photo ? "✓" : "＋"}</TP>
              <TP weight="bold" size={11} color={f.delivery_photo ? "#FFF" : theme.text} style={{ textAlign: "center", marginTop: 4 }}>PHOTO BON LIVRAISON</TP>
            </Pressable>
          </View>

          {err ? <View style={{ backgroundColor: theme.error, padding: 12, marginTop: 8 }}><TP color="#FFF" weight="bold" testID="rec-error">{err}</TP></View> : null}
        </ScrollView>
        <BottomBar>
          {!online ? <TP size={12} weight="bold" color={theme.warning} style={{ marginBottom: 8, textAlign: "center" }}>⚠ Hors ligne — enregistré localement puis synchronisé</TP> : null}
          <Btn label={busy ? "..." : online ? "Enregistrer la réception" : "Enregistrer (hors ligne)"} onPress={submit} disabled={busy} testID="rec-submit" />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}
