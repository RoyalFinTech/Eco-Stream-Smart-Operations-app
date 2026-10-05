const db = require("./db");
const { createSupabaseRepository } = require("./supabaseData");

function getRequestDb(req) {
  if (String(process.env.AUTH_PROVIDER || "json").toLowerCase() !== "supabase") return db;
  const token = req?.user?.accessToken;
  if (!token) throw Object.assign(new Error("Authenticated Supabase access token is required"), { status: 401 });
  return {
    driver: "supabase",
    collection(name) { return createSupabaseRepository(name, token); },
    async seedIfEmpty() { throw new Error("Supabase production mode does not support automatic demo seeding"); },
    async persist() {},
    async disconnect() {},
  };
}

module.exports = { getRequestDb };