const { createRepository } = require("./createRepository");
const { getPrismaClient, disconnectPrisma } = require("./prismaClient");

const MODEL_MAP = {
  users: "user", sessions: "session", projects: "project", bookings: "booking",
  payments: "payment", notifications: "notification", tickets: "ticket", documents: "document",
  chatMessages: "chatMessage", equipment: "equipment", expenses: "expense", cms: "cms", auditLogs: "auditLog",
};

const cache = {};
function collection(name) {
  const modelName = MODEL_MAP[name];
  if (!modelName) throw new Error(`No Prisma model mapped for collection "${name}"`);
  if (!cache[name]) cache[name] = createRepository(modelName);
  return cache[name];
}

module.exports = { collection, getPrismaClient, disconnectPrisma };