import { storage } from "@/src/utils/storage";
import { api } from "./api";

// Generate a UUID (client-side idempotency key)
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type QueueItem = {
  client_id: string;
  type: "reception" | "temperature" | "cleaning" | "nonconformity" | "loss";
  payload: any;
  created_at: string;
};

const QUEUE_KEY = "tracepro_offline_queue";

const CREATORS: Record<QueueItem["type"], (body: any) => Promise<any>> = {
  reception: (b) => api.createReception(b),
  temperature: (b) => api.createTemp(b),
  cleaning: (b) => api.createCleaning(b),
  nonconformity: (b) => api.createNC(b),
  loss: (b) => api.createLoss(b),
};

export async function getQueue(): Promise<QueueItem[]> {
  const q = await storage.getItem<any>(QUEUE_KEY, []);
  return Array.isArray(q) ? q : [];
}

async function setQueue(items: QueueItem[]) {
  await storage.setItem(QUEUE_KEY, items as any);
}

export async function enqueue(type: QueueItem["type"], payload: any): Promise<QueueItem> {
  const client_id = payload.client_id || uuid();
  const item: QueueItem = { client_id, type, payload: { ...payload, client_id }, created_at: new Date().toISOString() };
  const q = await getQueue();
  q.push(item);
  await setQueue(q);
  return item;
}

// Submit online, else enqueue. Always tags payload with a client_id for idempotency.
export async function submitOrQueue(type: QueueItem["type"], payload: any, online: boolean): Promise<{ queued: boolean; data?: any }> {
  const client_id = payload.client_id || uuid();
  const body = { ...payload, client_id };
  if (online) {
    try {
      const data = await CREATORS[type](body);
      return { queued: false, data };
    } catch {
      // network failed unexpectedly → queue it
      await enqueue(type, body);
      return { queued: true };
    }
  }
  await enqueue(type, body);
  return { queued: true };
}

// Sync all pending items. Idempotent server-side (client_id), so retries are safe.
export async function syncQueue(): Promise<{ synced: number; remaining: number }> {
  let q = await getQueue();
  if (q.length === 0) return { synced: 0, remaining: 0 };
  let synced = 0;
  const failed: QueueItem[] = [];
  for (const item of q) {
    try {
      await CREATORS[item.type](item.payload);
      synced++;
    } catch {
      failed.push(item);
    }
  }
  await setQueue(failed);
  return { synced, remaining: failed.length };
}

export async function queueCount(): Promise<number> {
  return (await getQueue()).length;
}
