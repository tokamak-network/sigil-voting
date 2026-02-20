/**
 * SigilStorage — Pluggable storage interface for SDK
 *
 * Allows SDK to work in both browser (localStorage) and Node.js (in-memory) environments.
 */

export interface SigilStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * In-memory storage for Node.js / testing environments.
 */
export class MemoryStorage implements SigilStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Browser localStorage wrapper implementing SigilStorage.
 */
export class BrowserStorage implements SigilStorage {
  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }
}

/**
 * Detect and return the appropriate default storage for the environment.
 */
export function createDefaultStorage(): SigilStorage {
  if (typeof localStorage !== 'undefined') {
    return new BrowserStorage();
  }
  return new MemoryStorage();
}
