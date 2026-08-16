import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Screen, TP, Header, Btn, Input, Divider, StatusPill } from "@/src/ui";
import { api, theme } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function Settings() {
  const router = useRouter();
  const { user, org, subscription, logout, refresh } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [invite, setInvite] = useState({ name: "", email: "", password: "", role: "employe" as "employe" | "responsable" });
  const [inviteMsg, setInviteMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadUsers = async () => {
    try { const u: any = await api.users(); setUsers(u); } catch {}
  };
  useEffect(() => { loadUsers(); }, []);

  const isManager = user?.role === "responsable";

  const doInvite = async () => {
    setBusy(true); setInviteMsg("");
    try {
      await api.invite(invite);
      setInviteMsg("Utilisateur créé ✓");
      setInvite({ name: "", email: "", password: "", role: "employe" });
      await loadUsers();
    } catch (e: any) { setInviteMsg(e.message); }
    finally { setBusy(false); }
  };

  const subscribeNow = async () => {
    setBusy(true);
    try { await api.subscribe(); await refresh(); } catch (e: any) { setInviteMsg(e.message); }
    finally { setBusy(false); }
  };

  const cancelSub = async () => {
    setBusy(true);
    try { await api.cancel(); await refresh(); } catch {}
    finally { setBusy(false); }
  };

  return (
    <Screen testID="settings-screen">
      <Header title="Profil & Réglages" />
      <View style={{ padding: 16 }}>
        {/* Company card */}
        <View style={{ backgroundColor: theme.dark, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
          <TP color={theme.brandSecondary} weight="bold" size={11} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Entreprise</TP>
          <TP color="#FFF" weight="black" size={20} style={{ marginTop: 4 }}>{org?.company_name}</TP>
          <TP color="#FFF" size={12} style={{ marginTop: 2 }}>{org?.business_type} · {org?.address}</TP>
          <TP color="#FFF" size={12}>{org?.phone}</TP>
        </View>

        {/* Subscription */}
        <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Abonnement</TP>
        <View style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <TP weight="black" size={18}>TRACEPRO PRO</TP>
              <TP size={13} color={theme.textMuted}>12,99 €/mois — Essai 15 jours</TP>
            </View>
            <StatusPill
              label={subscription?.state === "essai" ? `Essai · ${subscription?.days_left ?? "-"}j` : subscription?.state === "actif" ? "Actif" : "Expiré"}
              tone={subscription?.state === "actif" ? "success" : subscription?.state === "essai" ? "warning" : "danger"}
            />
          </View>
          {isManager && (
            <View style={{ marginTop: 12, gap: 8 }}>
              {subscription?.state !== "actif" ? (
                <Btn label="Activer l'abonnement" onPress={subscribeNow} disabled={busy} testID="subscribe-now" />
              ) : (
                <Btn label="Résilier à la fin de période" variant="danger" onPress={cancelSub} disabled={busy} testID="cancel-sub" />
              )}
              <TP size={11} color={theme.textMuted}>Résiliable à tout moment. Aucun engagement.</TP>
            </View>
          )}
        </View>

        {/* Rappels & controls */}
        <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Rappels & contrôles</TP>
        <Btn label="Configurer les rappels quotidiens" variant="ghost" onPress={() => router.push("/reminders")} testID="goto-reminders" />
        {isManager && (
          <>
            <View style={{ height: 8 }} />
            <Btn label="Générer le dossier de contrôle" variant="ghost" onPress={() => router.push("/dossier")} testID="goto-dossier" />
          </>
        )}

        {/* Users */}
        <TP weight="black" size={11} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Utilisateurs ({users.length})</TP>
        {users.map((u) => (
          <View key={u.id} style={{ borderWidth: 2, borderColor: theme.borderStrong, padding: 12, marginBottom: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <TP weight="black">{u.name}</TP>
              <TP size={12} color={theme.textMuted}>{u.email}</TP>
            </View>
            <StatusPill label={u.role === "responsable" ? "Responsable" : "Employé"} tone={u.role === "responsable" ? "success" : "neutral"} />
            {isManager && u.id !== user?.id && (
              <Pressable onPress={async () => { await api.deleteUser(u.id); await loadUsers(); }} testID={`del-user-${u.id}`} style={{ marginLeft: 8, backgroundColor: theme.error, paddingHorizontal: 10, paddingVertical: 8 }}>
                <TP color="#FFF" weight="black" size={11}>✕</TP>
              </Pressable>
            )}
          </View>
        ))}

        {/* Invite */}
        {isManager && (
          <View style={{ marginTop: 16, backgroundColor: theme.bg2, padding: 16, borderWidth: 2, borderColor: theme.borderStrong }}>
            <TP weight="black" size={13} style={{ marginBottom: 12, textTransform: "uppercase" }}>Ajouter un utilisateur</TP>
            <Input label="Nom" testID="inv-name" value={invite.name} onChangeText={(v) => setInvite({ ...invite, name: v })} />
            <Input label="E-mail" testID="inv-email" value={invite.email} onChangeText={(v) => setInvite({ ...invite, email: v })} autoCapitalize="none" keyboardType="email-address" />
            <Input label="Mot de passe initial" testID="inv-pwd" value={invite.password} onChangeText={(v) => setInvite({ ...invite, password: v })} secureTextEntry />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["employe", "responsable"] as const).map((r) => (
                <Pressable key={r} onPress={() => setInvite({ ...invite, role: r })} testID={`inv-role-${r}`} style={{ flex: 1, borderWidth: 2, borderColor: theme.borderStrong, padding: 10, backgroundColor: invite.role === r ? theme.dark : theme.bg }}>
                  <TP weight="bold" size={12} color={invite.role === r ? "#FFF" : theme.text}>{r === "employe" ? "Employé" : "Responsable"}</TP>
                </Pressable>
              ))}
            </View>
            <Btn label={busy ? "..." : "Créer l'utilisateur"} onPress={doInvite} disabled={busy} testID="inv-submit" />
            {inviteMsg ? <TP style={{ marginTop: 8 }} weight="bold">{inviteMsg}</TP> : null}
          </View>
        )}

        <Divider />
        <Btn label="Se déconnecter" variant="danger" onPress={logout} testID="logout-button" />
      </View>
    </Screen>
  );
}
