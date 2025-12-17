import fs from 'fs';
const STORAGE_FILE = './storage.json';

export interface Storage {
  subscribers: number[];
}

export const storage: Storage = loadStorage();

export function loadStorage(): Storage {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  } catch {
    return { subscribers: [] };
  }
}

export function saveStorage(obj: Storage) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(obj, null, 2));
}