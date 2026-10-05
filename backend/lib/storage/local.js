// lib/storage/local.js — the default storage provider. Fully tested (this is
// what documents.js already used before the abstraction existed).
const fs = require("fs");
const path = require("path");

function createLocalProvider({ dir }) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return {
    name: "local",
    async save(buffer, key) {
      fs.writeFileSync(path.join(dir, key), buffer);
      return { key };
    },
    async read(key) {
      const filePath = path.join(dir, key);
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath);
    },
    async remove(key) {
      const filePath = path.join(dir, key);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
    async exists(key) {
      return fs.existsSync(path.join(dir, key));
    },
  };
}

module.exports = { createLocalProvider };