const express = require("express");
const router = express.Router();
const multer = require("multer");
const pool = require("../db");

const jwt = require("jsonwebtoken");
const JWT_SECRET = "super_secret_key";

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

// رفع الصور
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("الملف لازم يكون صورة"), false);
    }
  },
});

router.post(
  "/register-company",
  auth,
  upload.fields([
    { name: "id_image", maxCount: 1 },
    { name: "id_back_image", maxCount: 1 },
    { name: "selfie_image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user_id = req.user.id;
      const { type, name, phone } = req.body;

      if (!type || !name || !phone) {
        return res.status(400).json({
          success: false,
          message: "كل الحقول مطلوبة",
        });
      }

      if (!req.files["id_image"] || !req.files["selfie_image"]) {
        return res.status(400).json({
          success: false,
          message: "الصور مطلوبة",
        });
      }

      // ✅ PostgreSQL
      const exist = await pool.query(
        "SELECT * FROM companies WHERE user_id = $1",
        [user_id]
      );

      if (exist.rows.length > 0) {
        return res.json({
          success: false,
          message: "عندك شركة مسجلة بالفعل",
        });
      }

      const idImage = req.files["id_image"]?.[0]?.filename || null;
      const idBackImage =
        req.files["id_back_image"]?.[0]?.filename || null;
      const selfieImage =
        req.files["selfie_image"]?.[0]?.filename || null;

      // ✅ PostgreSQL INSERT
      const result = await pool.query(
        `INSERT INTO companies 
        (user_id, type, name, phone, id_image, id_back_image, selfie_image, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id`,
        [
          user_id,
          type,
          name,
          phone,
          idImage,
          idBackImage,
          selfieImage,
          "pending",
        ]
      );

      res.json({
        success: true,
        message: "تم تسجيل الشركة وهي الآن قيد المراجعة",
        data: {
          id: result.rows[0].id,
          user_id,
          type,
          name,
          phone,
          status: "pending",
        },
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "حصل خطأ في السيرفر",
      });
    }
  }
);

module.exports = router