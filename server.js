require("dotenv").config();

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// static
app.use("/uploads", express.static("uploads"));

//////////////////////////////////////////////////////
// EMAIL SETUP (FINAL FIX 🔥🔥🔥)
//////////////////////////////////////////////////////
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,

  family: 4,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS.trim(),
  },

  tls: {
    rejectUnauthorized: false,
  },
});

//////////////////////////////////////////////////////
// SEND EMAIL FUNCTION
//////////////////////////////////////////////////////
async function sendEmail(to, subject, message) {
  try {
    const info = await transporter.sendMail({
      from:`"Awda App" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html:`<p>${message}</p>`
    });

    console.log("📩 Email sent:", info.response);
    return info;
  } catch (err) {
    console.log("❌ Email error:", err);
  }
}

//////////////////////////////////////////////////////
// ROOT
//////////////////////////////////////////////////////
app.get("/", (req, res) => {
  res.send("🚀 API is running");
});

//////////////////////////////////////////////////////
// TEST API
//////////////////////////////////////////////////////
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "API works 100%"
  });
});

//////////////////////////////////////////////////////
// ROUTES
//////////////////////////////////////////////////////
const companyRoutes = require("./routes/company");
app.use("/api/company", companyRoutes);

//////////////////////////////////////////////////////
// CONFIG
//////////////////////////////////////////////////////
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "secret";

//////////////////////////////////////////////////////
// DB TEST
//////////////////////////////////////////////////////
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL Connected");
    client.release();
  } catch (err) {
    console.log("❌ DB Error:", err.message);
  }
})();

//////////////////////////////////////////////////////
// AUTH MIDDLEWARE
//////////////////////////////////////////////////////
function auth(req, res, next) {
  const header = req.headers["authorization"];

  if (!header) {
    return res.status(401).json({ success: false, message: "No token" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log("❌ Auth error:", err.message);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

//////////////////////////////////////////////////////
// FORMAT PHONE
//////////////////////////////////////////////////////
function formatPhone(phone) {
  phone = phone.trim();

  if (phone.startsWith("+")) return phone;

  if (phone.startsWith("0")) {
    phone = phone.substring(1);
  }

  return "+249" + phone;
}

//////////////////////////////////////////////////////
// REGISTER
//////////////////////////////////////////////////////
app.post("/api/auth/register", async (req, res) => {
  try {
    console.log("📥 Register request:", req.body);

    let { username, name, email, password, phone } = req.body;

    const finalUsername = username || name;

    if (!finalUsername || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: "كل الحقول مطلوبة",
      });
    }

    phone = formatPhone(phone);

    const exist = await pool.query(
      "SELECT id FROM users WHERE email=$1 OR username=$2 OR phone=$3",
      [email, finalUsername, phone]
    );

    if (exist.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "المستخدم موجود مسبقاً",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users(username, phone, email, password, is_verified)
       VALUES($1,$2,$3,$4,$5) RETURNING id, username, email, phone`,
      [finalUsername, phone, email, hashed, true]
    );

    const user = result.rows[0];

    await pool.query(
      "INSERT INTO wallets(user_id, balance) VALUES($1,$2)",
      [user.id, 0]
    );

    // 🔥 EMAIL (ما يوقع التسجيل)
    sendEmail(
      email,
      "Welcome",
      "تم إنشاء حسابك بنجاح 🚀"
    );

    return res.status(201).json({
      success: true,
      message: "تم إنشاء الحساب بنجاح",
      user: user,
    });

  } catch (e) {
    console.error("❌ Register error:", e);
    return res.status(500).json({
      success: false,
      message: "خطأ في السيرفر",
    });
  }
});

//////////////////////////////////////////////////////
// LOGIN
//////////////////////////////////////////////////////
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("📥 Login request:", req.body);

    let { username, email, phone, password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "أدخل كلمة المرور",
      });
    }

    let identifier = username || email || phone;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "أدخل بيانات الدخول",
      });
    }

    identifier = identifier.trim();

    if (/^[0-9]+$/.test(identifier)) {
      identifier = formatPhone(identifier);
    }

    const users = await pool.query(
      `SELECT * FROM users 
       WHERE username=$1 OR email=$1 OR phone=$1`,
      [identifier]
    );

    if (users.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    const user = users.rows[0];

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور غلط",
      });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    delete user.password;

    return res.json({
      success: true,
      token,
      user,
    });

  } catch (e) {
    console.log("❌ Login error:", e);
    return res.status(500).json({
      success: false,
      message: "خطأ في السيرفر",
    });
  }
});

//////////////////////////////////////////////////////
// WALLET
//////////////////////////////////////////////////////
app.get("/api/wallet", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT balance FROM wallets WHERE user_id=$1",
      [req.user.id]
    );

    return res.json({
      success: true,
      balance: result.rows[0]?.balance || 0,
    });

  } catch (e) {
    console.log("❌ Wallet error:", e.message);
    return res.status(500).json({
      success: false,
      message: "خطأ في السيرفر",
    });
  }
});

//////////////////////////////////////////////////////
// ERROR HANDLER
//////////////////////////////////////////////////////
app.use((err, req, res, next) => {
  console.error("🔥 Global error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

//////////////////////////////////////////////////////
// 404
//////////////////////////////////////////////////////
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

//////////////////////////////////////////////////////
// SERVER
//////////////////////////////////////////////////////
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port " + PORT);
});

//////////////////////////////////////////////////////
// CRASH PROTECTION
//////////////////////////////////////////////////////
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err);
});