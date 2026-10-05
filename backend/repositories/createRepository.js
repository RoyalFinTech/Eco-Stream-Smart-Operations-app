const { getPrismaClient } = require("./prismaClient");

const DATE_FIELDS = new Set([
  "createdAt", "updatedAt", "startDate", "submittedAt", "date", "lastMaintenance", "expiresAt", "revokedAt", "lastUsedAt",
]);
const BIGINT_FIELDS = new Set(["resetTokenExpires", "lockUntil"]);

function normalizeInput(data) {
  const out = { ...data };
  if (out.status === "in-progress") out.status = "in_progress";
  if (out.category === "water-test") out.category = "water_test";
  for (const key of Object.keys(out)) {
    if (DATE_FIELDS.has(key) && out[key] != null && !(out[key] instanceof Date)) {
      out[key] = new Date(out[key]);
    }
    if (BIGINT_FIELDS.has(key) && out[key] != null && typeof out[key] !== "bigint") {
      out[key] = BigInt(out[key]);
    }
  }
  return out;
}

function normalizeOutput(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of BIGINT_FIELDS) {
    if (typeof out[key] === "bigint") out[key] = Number(out[key]);
  }
  for (const key of DATE_FIELDS) {
    if (out[key] instanceof Date) out[key] = out[key].toISOString();
  }
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (value && typeof value.toNumber === "function" && typeof value.toFixed === "function") {
      out[key] = value.toNumber();
    }
  }
  // Prisma enum values use the identifier while the HTTP API historically
  // exposes the mapped string value. Keep the API contract unchanged.
  if (out.status === "in_progress") out.status = "in-progress";
  if (out.category === "water_test") out.category = "water-test";
  return out;
}

function normalizeRows(rows) { return rows.map(normalizeOutput); }

function createRepository(modelName) {
  const prisma = () => getPrismaClient()[modelName];
  return {
    async all() { return normalizeRows(await prisma().findMany()); },
    async find(predicateOrWhere) {
      if (typeof predicateOrWhere === "function") return normalizeRows((await prisma().findMany()).filter(predicateOrWhere));
      return normalizeRows(await prisma().findMany({ where: predicateOrWhere }));
    },
    async findOne(predicateOrWhere) {
      const row = typeof predicateOrWhere === "function"
        ? (await prisma().findMany()).find(predicateOrWhere)
        : await prisma().findFirst({ where: predicateOrWhere });
      return normalizeOutput(row || null);
    },
    async findById(id) { return normalizeOutput(await prisma().findUnique({ where: { id } })); },
    async insert(data) { return normalizeOutput(await prisma().create({ data: normalizeInput(data) })); },
    async updateById(id, patch) {
      try { return normalizeOutput(await prisma().update({ where: { id }, data: normalizeInput(patch) })); }
      catch (err) {
        if (err && err.code === "P2025") return null;
        throw err;
      }
    },
    async removeById(id) {
      try { await prisma().delete({ where: { id } }); return true; }
      catch (err) {
        if (err && err.code === "P2025") return false;
        throw err;
      }
    },
    async replaceAll(records) {
      throw new Error("replaceAll is intentionally unsupported for PostgreSQL; use an explicit migration/transaction instead");
    },
  };
}

module.exports = { createRepository };