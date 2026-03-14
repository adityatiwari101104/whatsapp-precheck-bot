import fs from "fs";
import path from "path";

const sessionStore = new Map();
const precheckStore = new Map();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "prechecks.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizePrechecks(value) {
  if (Array.isArray(value)) {
    return value.reduce((acc, item) => {
      if (item?.id) {
        acc[item.id] = item;
      }
      return acc;
    }, {});
  }

  return asRecord(value);
}

function hydrateStoreFromDisk() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) {
      return;
    }

    const parsed = JSON.parse(raw);
    const sessions = asRecord(parsed?.sessions);
    const prechecks = normalizePrechecks(parsed?.prechecks);

    Object.entries(sessions).forEach(([phone, session]) => {
      sessionStore.set(phone, session);
    });

    Object.entries(prechecks).forEach(([id, record]) => {
      precheckStore.set(id, record);
    });
  } catch (error) {
    console.error("Failed to load persisted precheck store:", error.message);
  }
}

function persistStore() {
  try {
    ensureDataDir();

    const payload = {
      sessions: Object.fromEntries(sessionStore),
      prechecks: Object.fromEntries(precheckStore)
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to persist precheck store:", error.message);
  }
}

hydrateStoreFromDisk();

export function getSession(phone) {
  return sessionStore.get(phone) || null;
}

export function setSession(phone, session) {
  sessionStore.set(phone, session);
  persistStore();
}

export function clearSession(phone) {
  sessionStore.delete(phone);
  persistStore();
}

function generatePrecheckId() {
  let id = "";

  do {
    const part = Math.random().toString(36).slice(2, 8).toUpperCase();
    id = `PC-${part}`;
  } while (precheckStore.has(id));

  return id;
}

export function savePrecheck(payload) {
  const id = generatePrecheckId();
  const record = {
    id,
    createdAt: new Date().toISOString(),
    ...payload
  };
  precheckStore.set(id, record);
  persistStore();
  return record;
}

export function getPrecheckById(id) {
  return precheckStore.get(id) || null;
}

export function listPrechecks() {
  return Array.from(precheckStore.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
