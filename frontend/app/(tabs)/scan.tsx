import { useState, useEffect } from "react";
import { View, Platform, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Screen, TP, Header, Input, Btn } from "@/src/ui";
import { theme, api } from "@/src/api";

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState("");

  const isNative = Platform.OS === "ios" || Platform.OS === "android";

  const handleCode = async (code: string) => {
    if (!code || scanned) return;
    setScanned(true);
    setMsg(`Code : ${code}`);
    try {
      const r: any = await api.search(code);
      if (r.batches?.length) {
        router.push(`/batch/${encodeURIComponent(r.batches[0].batch_number)}`);
      } else {
        router.push({ pathname: "/reception/new", params: { barcode: code } });
      }
    } catch (e: any) { setMsg(e.message); }
    setTimeout(() => setScanned(false), 1500);
  };

  return (
    <Screen scroll={false} testID="scan-screen">
      <Header title="Scanner" />
      {isNative ? (
        !permission ? <View /> : !permission.granted ? (
          <View style={{ padding: 24 }}>
            <TP style={{ marginBottom: 16 }}>Autorisation caméra requise pour scanner codes-barres et QR codes.</TP>
            <Btn label="Autoriser l'accès" onPress={requestPermission} testID="perm-camera" />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={{ height: 320, borderWidth: 2, borderColor: theme.borderStrong, margin: 16, overflow: "hidden" }}>
              <CameraView
                testID="camera-view"
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "pdf417"] }}
                onBarcodeScanned={scanned ? undefined : (r) => handleCode(r.data)}
              />
              <View pointerEvents="none" style={{ position: "absolute", left: 40, right: 40, top: 100, bottom: 100, borderWidth: 3, borderColor: theme.brand }} />
            </View>
            {msg ? <TP style={{ textAlign: "center", padding: 8 }} weight="bold" testID="scan-status">{msg}</TP> : null}
          </View>
        )
      ) : (
        <View style={{ padding: 24, backgroundColor: theme.bg2, margin: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
          <TP weight="black" size={16}>Scanner indisponible sur navigateur</TP>
          <TP size={12} color={theme.textMuted} style={{ marginTop: 8 }}>Utilisez la saisie manuelle ci-dessous ou ouvrez l'app sur mobile.</TP>
        </View>
      )}
      <View style={{ padding: 16 }}>
        <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Saisie manuelle</TP>
        <Input testID="scan-manual-input" placeholder="Code-barres ou numéro de lot" value={manual} onChangeText={setManual} autoCapitalize="characters" />
        <Btn label="Rechercher" onPress={() => handleCode(manual)} testID="scan-manual-submit" />
      </View>
    </Screen>
  );
}
