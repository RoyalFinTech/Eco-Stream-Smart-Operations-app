// lib/db.js — storage boundary.
// JSON is the safe local/default driver; PostgreSQL is enabled with DB_DRIVER=postgres.
// Both drivers expose the same asynchronous collection API so routes are storage-agnostic.

const fs = require("fs");
const path = require("path");

const DRIVER = String(process.env.DB_DRIVER || "json").toLowerCase();

if (DRIVER === "postgres") {
  const { collection, disconnectPrisma } = require("../repositories");
  module.exports = {
    driver: DRIVER,
    collection,
    async seedIfEmpty(name, seedFn) {
      const repo = collection(name);
      const existing = await repo.all();
      if (existing.length === 0) {
        const rows = await seedFn();
        for (const row of rows) await repo.insert(row);
      }
    },
    async persist() {},
    disconnect: disconnectPrisma,
  };
} else {
  const DATA_DIR = path.join(__dirname, "..", "database");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const FILE = path.join(DATA_DIR, "store.json");

  function loadRaw() {
    if (!fs.existsSync(FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch (e) {
      console.error("[db] corrupt store.json, starting fresh:", e.message);
      return {};
    }
  }

  let state = loadRaw();

  function persistSync() {
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  }

  function matches(row, where) {
    return Object.entries(where || {}).every(([key, expected]) => {
      if (expected && typeof expected === "object" && Array.isArray(expected.in)) return expected.in.includes(row[key]);
      return row[key] === expected;
    });
  }

  function collection(name) {
    if (!state[name]) state[name] = [];
    return {
      async all() { return state[name]; },
      async find(predicateOrWhere) {
        return typeof predicateOrWhere === "function" ? state[name].filter(predicateOrWhere) : state[name].filter((row) => matches(row, predicateOrWhere));
      },
      async findOne(predicateOrWhere) {
        return (typeof predicateOrWhere === "function" ? state[name].find(predicateOrWhere) : state[name].find((row) => matches(row, predicateOrWhere))) || null;
      },
      async findById(id) { return state[name].find((r) => r.id === id) || null; },
      async insert(record) { state[name].push(record); persistSync(); return record; },
      async updateById(id, patch) {
        const idx = state[name].findIndex((r) => r.id === id);
        if (idx === -1) return null;
        state[name][idx] = { ...state[name][idx], ...patch, updatedAt: new Date().toISOString() };
        persistSync();
        return state[name][idx];
      },
      async removeById(id) {
        const before = state[name].length;
        state[name] = state[name].filter((r) => r.id !== id);
        persistSync();
        return state[name].length < before;
      },
      async replaceAll(records) { state[name] = records; persistSync(); },
    };
  }

  async function seedIfEmpty(name, seedFn) {
    if (!state[name] || state[name].length === 0) {
      state[name] = await seedFn();
      persistSync();
    }
  }

  module.exports = { driver: DRIVER, collection, seedIfEmpty, persist: async () => persistSync(), disconnect: async () => {} };
}