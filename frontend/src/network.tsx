import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { syncQueue, queueCount, submitOrQueue, QueueItem } from "./offline";

export type SyncState = "online" | "offline" | "synchronizing" | "synchronized";

type NetState = {
  online: boolean;
  syncState: SyncState;
  pendingCount: number;
  refreshPending: () => Promise<void>;
  syncNow: () => Promise<void>;
  submit: (type: QueueItem["type"], payload: any) => Promise<{ queued: boolean; data?: any }>;
};

const NetworkContext = createContext<NetState | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("online");
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);
  const wasOffline = useRef(false);

  const refreshPending = useCallback(async () => {
    setPendingCount(await queueCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    const count = await queueCount();
    if (count === 0) {
      setSyncState(online ? "online" : "offline");
      return;
    }
    syncingRef.current = true;
    setSyncState("synchronizing");
    try {
      const { remaining } = await syncQueue();
      setPendingCount(remaining);
      if (remaining === 0) {
        setSyncState("synchronized");
        setTimeout(() => setSyncState((s) => (s === "synchronized" ? "online" : s)), 2500);
      } else {
        setSyncState(online ? "online" : "offline");
      }
    } finally {
      syncingRef.current = false;
    }
  }, [online]);

  const submit = useCallback(async (type: QueueItem["type"], payload: any) => {
    const res = await submitOrQueue(type, payload, online);
    await refreshPending();
    if (res.queued) setSyncState(online ? "online" : "offline");
    return res;
  }, [online, refreshPending]);

  useEffect(() => {
    refreshPending();
    const unsub = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) {
        setSyncState((s) => (s === "synchronizing" ? s : "online"));
        if (wasOffline.current) {
          wasOffline.current = false;
          syncNow();
        }
      } else {
        wasOffline.current = true;
        setSyncState("offline");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NetworkContext.Provider value={{ online, syncState, pendingCount, refreshPending, syncNow, submit }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork outside provider");
  return ctx;
}
