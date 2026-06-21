import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { products } from "../src/db/schema/products.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
console.log("URL prefix:", url.substring(0, 40));

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema: { products } });

try {
  console.log("1. Simple SELECT 1...");
  const r1 = await db.execute("SELECT 1 as ok");
  console.log("OK:", JSON.stringify(r1));

  console.log("2. Raw SQL on products...");
  const r2 = await db.execute("SELECT count(*) as cnt FROM products");
  console.log("OK:", JSON.stringify(r2));

  console.log("3. Drizzle .from(products).limit(1)...");
  const r3 = await db.select().from(products).limit(1);
  console.log("OK:", JSON.stringify(r3, null, 2));
} catch (err) {
  console.error("ERR:", err.message);
  console.error("Code:", err.code);
  console.error("Detail:", err.detail);
  console.error("Hint:", err.hint);
} finally {
  await sql.end();
}
