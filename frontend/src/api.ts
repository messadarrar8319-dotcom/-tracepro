import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const KEY = "tracepro_token";

async function saveToken(t: string | null) {
  if (Platform.OS === "web") {
    if (t) await AsyncStorage.setItem(KEY, t);
    else await AsyncStorage.removeItem(KEY);
  } else {
    if (t) await SecureStore.setItemAsync(KEY, t);
    else await SecureStore.deleteItemAsync(KEY);
  }
}

async function readToken(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

export type ApiOptions = RequestInit & { auth?: boolean };

async function request<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = await readToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as any || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!res.ok) throw new Error(data.detail || `Erreur ${res.status}`);
  return data as T;
}

export const api = {
  saveToken,
  readToken,
  clearToken: () => saveToken(null),

  register: (body: any) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  forgot: (email: string) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }),
  updateOrg: (body: any) =>
    request("/organization", { method: "PATCH", body: JSON.stringify(body) }),

  users: () => request("/users"),
  invite: (body: any) => request("/users/invite", { method: "POST", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: "DELETE" }),

  subStatus: () => request("/subscription/status"),
  subscribe: () => request("/subscription/subscribe", { method: "POST" }),
  cancel: () => request("/subscription/cancel", { method: "POST" }),

  uploadFile: async (uri: string, name: string, type: string) => {
    const token = await readToken();
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      form.append("file", { uri, name, type } as any);
    }
    const res = await fetch(`${API}/api/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form as any,
    });
    if (!res.ok) throw new Error(`Upload échoué: ${res.status}`);
    return res.json();
  },
  fileUrl: (path: string) => `${API}/api/files/${path}`,

  dashboard: () => request("/dashboard"),

  createReception: (body: any) => request("/receptions", { method: "POST", body: JSON.stringify(body) }),
  listReceptions: () => request("/receptions"),
  getReception: (id: string) => request(`/receptions/${id}`),
  batch: (n: string) => request(`/batches/${encodeURIComponent(n)}`),

  createTemp: (body: any) => request("/temperatures", { method: "POST", body: JSON.stringify(body) }),
  listTemps: () => request("/temperatures"),

  createCleaning: (body: any) => request("/cleaning", { method: "POST", body: JSON.stringify(body) }),
  listCleaning: () => request("/cleaning"),

  createNC: (body: any) => request("/non-conformities", { method: "POST", body: JSON.stringify(body) }),
  listNCs: () => request("/non-conformities"),
  updateNCStatus: (id: string, status: string) =>
    request(`/non-conformities/${id}?status=${status}`, { method: "PATCH" }),

  createLoss: (body: any) => request("/losses", { method: "POST", body: JSON.stringify(body) }),
  listLosses: () => request("/losses"),

  search: (q: string) => request(`/search?q=${encodeURIComponent(q)}`),

  archives: (year?: number) => request(`/archives${year ? `?year=${year}` : ""}`),
  batchPdfUrl: async (batch: string) => {
    const token = await readToken();
    return { url: `${API}/api/export/batch/${encodeURIComponent(batch)}`, token };
  },
};

export const theme = {
  brand: "#E65100",
  brandSecondary: "#FF9800",
  bg: "#FFFFFF",
  bg2: "#F4F4F5",
  bg3: "#E4E4E7",
  text: "#111111",
  textMuted: "#52525B",
  border: "#E4E4E7",
  borderStrong: "#18181B",
  success: "#2E7D32",
  warning: "#F57F17",
  error: "#C62828",
  dark: "#18181B",
};
