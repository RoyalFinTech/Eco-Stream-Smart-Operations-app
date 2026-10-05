// repositories/prismaClient.js
//
// ⚠️ STATUS: correct, standard Prisma setup — NOT runnable in this sandbox
// (no `npm install @prisma/client`, no reachable Postgres). Requiring this
// file will throw a clear error until both are available; every repository
// module below depends on it, so the whole repositories/ layer is
// opt-in and inactive until you switch DB_DRIVER=postgres (see
// documentation/POSTGRES_MIGRATION.md). The JSON-file datastore (lib/db.js)
// remains the default and is unaffected by any of this.

let PrismaClient;
try {
  ({ PrismaClient } = require("@prisma/client"));
} catch {
  PrismaClient = null;
}

let client = null;

function getPrismaClient() {
  if (!PrismaClient) {
    throw new Error(
      "@prisma/client is not installed. Run `npm install prisma @prisma/client` and `npx prisma generate` " +
      "(requires npm registry access this sandbox doesn't have) before using DB_DRIVER=postgres."
    );
  }
  if (!client) {
    client = new PrismaClient({
      // Connection pooling: Prisma manages its own pool over one PgBouncer-
      // friendly connection string. Tune pool size via the connection_limit
      // query param on DATABASE_URL, e.g.
      //   postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
      // rather than here — see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections
      log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error", "warn", "query"],
    });
  }
  return client;
}

async function disconnectPrisma() {
  if (client) await client.$disconnect();
}

module.exports = { getPrismaClient, disconnectPrisma };