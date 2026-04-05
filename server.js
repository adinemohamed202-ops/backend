const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const express = require("express");
const nodemailer = require("nodemailer"); // ✅ إضافة

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 عرض الصور
app.use("/uploads", express.static("uploads"));

// 🔥 routes الشركات
const companyRoutes = require("./routes/company");
app.use("/api/company", companyRoutes);

const PORT = 3000;
const JWT_SECRET = "super_secret_key";

//////////////////////////////////////////////////////
// EMAIL CONFIG 🔥 (إضافة فقط)
//////////////////////////////////////////////////////

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your_email@gmail.com",
    pass: "your_app_password",
  },
});

//////////////////////////////////////////////////////
// MIDDLEWARE 🔐
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
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

//////////////////////////////////////////////////////
// REGISTER
//////////////////////////////////////////////////////

app.post("/register", async (req, res) => {
  const { name, phone, email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: "بيانات ناقصة" });
  }

  try {
    const exist = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (exist.rows.length > 0) {
      return res.json({ success: false, message: "الإيميل مستخدم" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // ✅ إضافة OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const result = await pool.query(
      "INSERT INTO users(name, phone, email, password, is_verified, status, otp_code) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [name, phone, email, hashed, false, "pending", otp]
    );

    const userId = result.rows[0].id;

    await pool.query(
      "INSERT INTO wallets(user_id, balance) VALUES($1,$2)",
      [userId, 0]
    );

    // ✅ إرسال الإيميل
    await transporter.sendMail({
      from: "your_email@gmail.com",
      to: email,
      subject: "كود التحقق",
      text:` كود التحقق الخاص بك هو: ${otp},`
    });

    console.log("✅ Email sent");

    res.json({ success: true });

  } catch (e) {
    console.log(e);
    res.json({ success: false, message: "خطأ في السيرفر" });
  }
});

//////////////////////////////////////////////////////
// VERIFY (إضافة فقط)
//////////////////////////////////////////////////////

app.post("/verify", async (req, res) => {
  const { email, code } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false });
    }

    const user = result.rows[0];

    if (user.otp_code !== code) {
      return res.json({ success: false, message: "كود خاطئ" });
    }

    await pool.query(
      "UPDATE users SET is_verified=true WHERE email=$1",
      [email]
    );

    res.json({ success: true });

  } catch (e) {
    console.log(e);
    res.json({ success: false });
  }
});

//////////////////////////////////////////////////////
// 🔥 RESEND OTP (إضافة فقط)
//////////////////////////////////////////////////////

app.post("/resend", async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET otp_code=$1 WHERE email=$2",
      [otp, email]
    );

    await transporter.sendMail({
      from: "your_email@gmail.com",
      to: email,
      subject: "كود التحقق الجديد",
      text:` الكود الجديد: ${otp},`
    });

    console.log("📩 OTP resent");

    res.json({ success: true });

  } catch (e) {
    console.log(e);
    res.json({ success: false });
  }
});

//////////////////////////////////////////////////////
// LOGIN
//////////////////////////////////////////////////////

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const users = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (users.rows.length === 0) {
      return res.json({ success: false, message: "بيانات خاطئة" });
    }

    const user = users.rows[0];

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.json({ success: false, message: "بيانات خاطئة" });
    }

    if (!user.is_verified) {
      return res.json({ success: false, message: "الحساب غير مفعل" });
    }

    if (user.status === "pending") {
      return res.json({
        success: false,
        message: "الحساب قيد المراجعة",
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: user,
    });

  } catch (e) {
    console.log(e);
    res.json({ success: false, message: "خطأ في السيرفر" });
  }
});

//////////////////////////////////////////////////////
// WALLET
//////////////////////////////////////////////////////

app.get("/wallet/:userId", auth, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT balance FROM wallets WHERE user_id=$1",
      [userId]
    );

    res.json({
      success: true,
      balance: result.rows[0]?.balance || 0,
    });

  } catch (e) {
    console.log(e);
    res.json({ success: false });
  }
});

//////////////////////////////////////////////////////
// DEPOSITS
//////////////////////////////////////////////////////

app.post("/deposits/create", auth, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  try {
    await pool.query(
      "INSERT INTO deposit_requests(user_id, amount, status) VALUES($1,$2,'pending')",
      [userId, amount]
    );

    res.json({ success: true });

  } catch (e) {
    console.log(e);
    res.json({ success: false });
  }
});

app.post("/admin/deposits/approve", auth, async (req, res) => {
  const { request_id } = req.body;

  if (req.user.email !== "admin@app.com") {
    return res.json({ success: false, message: "غير مصرح" });
  }

  try {
    const rows = await pool.query(
      "SELECT * FROM deposit_requests WHERE id=$1",
      [request_id]
    );

    const request = rows.rows[0];

    if (!request) return res.json({ success: false });

    await pool.query(
      "UPDATE wallets SET balance = balance + $1 WHERE user_id=$2",
      [request.amount, request.user_id]
    );

    await pool.query(
      "UPDATE deposit_requests SET status='approved' WHERE id=$1",
      [request_id]
    );

    res.json({ success: true });

  } catch (e) {
    console.log(e);
    res.json({ success: false });
  }
});

//////////////////////////////////////////////////////
// SEARCH USERS (ADMIN)
//////////////////////////////////////////////////////

app.post("/admin/search-users", auth, async (req, res) => {
  const { email, id, wallet, name } = req.body;

  if (req.user.email !== "admin@app.com") {
    return res.json({ success: false, message: "غير مصرح" });
  }

  try {
    let conditions = [];
    let values = [];
    let index = 1;

    if (email) {
      conditions.push(`users.email = $${index++}`);
      values.push(email);
    }

    if (id) {
      conditions.push(`users.id = $${index++}`);
      values.push(id);
    }

    if (name) {
      conditions.push(`users.name ILIKE $${index++}`);
      values.push(`%${name}%`);
    }

    if (wallet) {
      conditions.push(`wallets.id = $${index++}`);
      values.push(wallet);
    }

    if (conditions.length === 0) {
      return res.json({
        success: false,
        message: "أدخل حقل واحد على الأقل",
      });
    }

    const query = `
      SELECT users.*, wallets.id AS wallet_id, wallets.balance
      FROM users
      LEFT JOIN wallets ON wallets.user_id = users.id
      WHERE ${conditions.join(" AND ")}
    `;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });

  } catch (e) {
    console.log(e);
    res.json({ success: false, message: "خطأ في السيرفر" });
  }
});

//////////////////////////////////////////////////////
// SERVER
//////////////////////////////////////////////////////

app.listen(PORT, '0.0.0.0', () => {
  console.log("🚀 Server running on port " + PORT);
});