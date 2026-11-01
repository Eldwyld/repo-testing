/**
 * Local-first persistence. Everything stays in this browser (IndexedDB);
 * there is no network sync or sharing. Records are validated on the way in.
 */
import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { validateConfig } from '../config/io';
import { Preset } from '../config/presets';
import { defaultConfig, ForgeConfig } from '../config/schema';
import { SessionRecord } from '../session/types';

export type SessionSummary = {
  sessionId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  endReason?: string;
  identityId?: string;
  eventCount: number;
  durationMs: number;
};

export interface ForgeStore {
  loadConfig(): Promise<{ config: ForgeConfig; notes: string[] }>;
  saveConfig(config: ForgeConfig): Promise<void>;
  listPresets(): Promise<Preset[]>;
  savePreset(preset: Preset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  listSessions(): Promise<SessionSummary[]>;
  getSession(id: string): Promise<SessionRecord | undefined>;
  saveSession(record: SessionRecord): Promise<void>;
  deleteSession(id: string): Promise<void>;
  deleteAllSessions(): Promise<number>;
}

export function summarize(record: SessionRecord): SessionSummary {
  const start = record.events.find(e => e.type === 'session_started');
  return {
    sessionId: record.sessionId,
    title: record.title,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    endReason: record.endReason,
    identityId: start ? String(start.data.identityId ?? '') : undefined,
    eventCount: record.events.length,
    durationMs: record.events[record.events.length - 1]?.t ?? 0,
  };
}

const sortSummaries = (list: SessionSummary[]) => list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

function loadOrDefault(raw: unknown): { config: ForgeConfig; notes: string[] } {
  if (raw === undefined) return { config: defaultConfig(), notes: [] };
  const r = validateConfig(raw);
  if (r.ok) return { config: r.value, notes: r.notes };
  return { config: defaultConfig(), notes: ['Stored configuration was invalid and has been replaced by defaults.', ...r.errors.slice(0, 5)] };
}

export class MemoryStore implements ForgeStore {
  config: unknown;
  presets = new Map<string, Preset>();
  sessions = new Map<string, SessionRecord>();
  async loadConfig() { return loadOrDefault(this.config); }
  async saveConfig(config: ForgeConfig) { this.config = structuredClone(config); }
  async listPresets() { return [...this.presets.values()]; }
  async savePreset(p: Preset) { this.presets.set(p.id, structuredClone(p)); }
  async deletePreset(id: string) { this.presets.delete(id); }
  async listSessions() { return sortSummaries([...this.sessions.values()].map(summarize)); }
  async getSession(id: string) { return this.sessions.get(id); }
  async saveSession(r: SessionRecord) { this.sessions.set(r.sessionId, structuredClone(r)); }
  async deleteSession(id: string) { this.sessions.delete(id); }
  async deleteAllSessions() { const n = this.sessions.size; this.sessions.clear(); return n; }
}

interface ForgeDB extends DBSchema {
  kv: { key: string; value: unknown };
  presets: { key: string; value: Preset };
  sessions: { key: string; value: SessionRecord };
  sessionIndex: { key: string; value: SessionSummary };
}

export class IdbStore implements ForgeStore {
  private db: Promise<IDBPDatabase<ForgeDB>>;

  constructor(name = 'joi-forge') {
    this.db = openDB<ForgeDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore('kv');
        db.createObjectStore('presets', { keyPath: 'id' });
        db.createObjectStore('sessions', { keyPath: 'sessionId' });
        db.createObjectStore('sessionIndex', { keyPath: 'sessionId' });
      },
    });
  }

  async loadConfig() {
    return loadOrDefault(await (await this.db).get('kv', 'config'));
  }
  async saveConfig(config: ForgeConfig) {
    await (await this.db).put('kv', structuredClone(config), 'config');
  }
  async listPresets() {
    return (await this.db).getAll('presets');
  }
  async savePreset(p: Preset) {
    await (await this.db).put('presets', structuredClone(p));
  }
  async deletePreset(id: string) {
    await (await this.db).delete('presets', id);
  }
  async listSessions() {
    return sortSummaries(await (await this.db).getAll('sessionIndex'));
  }
  async getSession(id: string) {
    return (await this.db).get('sessions', id);
  }
  async saveSession(r: SessionRecord) {
    const db = await this.db;
    const tx = db.transaction(['sessions', 'sessionIndex'], 'readwrite');
    await Promise.all([tx.objectStore('sessions').put(structuredClone(r)), tx.objectStore('sessionIndex').put(summarize(r)), tx.done]);
  }
  async deleteSession(id: string) {
    const db = await this.db;
    const tx = db.transaction(['sessions', 'sessionIndex'], 'readwrite');
    await Promise.all([tx.objectStore('sessions').delete(id), tx.objectStore('sessionIndex').delete(id), tx.done]);
  }
  async deleteAllSessions() {
    const db = await this.db;
    const n = await db.count('sessions');
    const tx = db.transaction(['sessions', 'sessionIndex'], 'readwrite');
    await Promise.all([tx.objectStore('sessions').clear(), tx.objectStore('sessionIndex').clear(), tx.done]);
    return n;
  }
}

let shared: ForgeStore | null = null;
export function getStore(): ForgeStore {
  if (!shared) shared = typeof indexedDB === 'undefined' ? new MemoryStore() : new IdbStore();
  return shared;
}
export function setStore(store: ForgeStore) {
  shared = store;
}
