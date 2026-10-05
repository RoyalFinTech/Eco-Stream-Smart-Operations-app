// Optional development/demo seed. Production should not run this automatically.
if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
  console.log("EcoStream Prisma seed skipped in production (set SEED_DEMO_DATA=true only for an explicit demo environment).\n");
  process.exit(0);
}

const db = require("../lib/db");
const { seed } = require("../lib/seed");

if (db.driver !== "postgres") {
  throw new Error("prisma/seed.js requires DB_DRIVER=postgres");
}

seed(db)
  .then(() => db.disconnect())
  .catch((err) => {
    console.error("Prisma seed failed:", err);
    process.exit(1);
  });