import Dexie, { type EntityTable } from "dexie";

import type { StepRecordPayload } from "@/lib/records/payload";

import type { Cleaner, CleanerData } from "@/components/cleaner/types";

export type OutboxStatus = "pending" | "synced" | "rejected";

/** A step record written on the device. Kept after sync so progress never depends on the network. */
export interface LocalRecord {
  clientRecordId: string;
  createdAt: number;
  taskId: string;
  stepId: string;
  payload: StepRecordPayload;
  payloadHash: string;
  status: OutboxStatus;
  attempts: number;
  error?: string;
}

/** A photo blob waiting to upload (removed from the device once the server has it). */
export interface LocalPhoto {
  clientPhotoId: string;
  clientRecordId: string;
  createdAt: number;
  /** Null once the server has the verified photo. */
  blob: Blob | null;
  sha256: string;
  takenAt: string;
  status: OutboxStatus;
  attempts: number;
  error?: string;
}

export interface CachedCleaner extends Cleaner {
  pinHash: string | null;
}

export interface KeyValue {
  key: string;
  value: unknown;
  updatedAt: number;
}

export class IcaDb extends Dexie {
  records!: EntityTable<LocalRecord, "clientRecordId">;
  photos!: EntityTable<LocalPhoto, "clientPhotoId">;
  kv!: EntityTable<KeyValue, "key">;

  constructor(name = "ica") {
    super(name);
    this.version(1).stores({
      records: "clientRecordId, status, taskId, createdAt",
      photos: "clientPhotoId, status, clientRecordId, createdAt",
      kv: "key",
    });
  }
}

let instance: IcaDb | null = null;
export function getDb(): IcaDb {
  instance ??= new IcaDb();
  return instance;
}

export const KV = {
  cleanerData: "cleanerData",
  cleaners: "cleaners",
  currentCleaner: "currentCleaner",
} as const;

export async function kvGet<T>(db: IcaDb, key: string): Promise<{ value: T; updatedAt: number } | undefined> {
  const row = await db.kv.get(key);
  return row ? { value: row.value as T, updatedAt: row.updatedAt } : undefined;
}

export async function kvSet(db: IcaDb, key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value, updatedAt: Date.now() });
}

export type { CleanerData };
