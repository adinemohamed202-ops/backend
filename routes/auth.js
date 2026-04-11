const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "super_secret_key";

/// ================= REGISTER =================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "كل الحقول مطلوبة",
      });
    }

    // check user exists
    const exist = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (exist.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "المستخدم موجود بالفعل",
      });
    }

    // insert user
    const result = await pool.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, password]
    );

    res.json({
      success: true,
      message: "تم إنشاء الحساب بنجاح",
      user: result.rows[0],
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "خطأ في السيرفر",
    });
  }
});

/// ================= LOGIN =================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    const dbUser = user.rows[0];

    if (dbUser.password !== password) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور غير صحيحة",
      });
    }

    // create token
    const token = jwt.sign(
      { id: dbUser.id, email: dbUser.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "تم تسجيل الدخول",
      token,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      success: false,
      message: "خطأ في السيرفر",
    });
  }
});

module.exports = router;