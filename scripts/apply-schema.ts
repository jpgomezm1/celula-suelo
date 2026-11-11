import { readFileSync } from "node:fs";
import pg from "pg";
const file = process.argv[2] ?? "db/schema.sql";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query(readFileSync(file, "utf8"));
console.log(`Aplicado ${file}`);
await db.end();
