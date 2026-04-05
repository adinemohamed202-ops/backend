const { Pool } = require("pg");

// إنشاء الاتصال
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "awda_transport",
  password: "Adine2002$", // نفس الباسورد حق PgAdmin
  port: 5432,
});

// اختبار الاتصال
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ PostgreSQL Connected");
    release();
  }
});

module.exports = pool;