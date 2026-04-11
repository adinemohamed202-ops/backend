const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

// اختبار الاتصال
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL Connected Successfully");
    client.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
});

pool.on("error", (err) => {
  console.error("❌ Unexpected DB error:", err.message);
});

module.exports = pool;