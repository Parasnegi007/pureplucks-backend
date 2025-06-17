const express = require("express");
const router = express.Router();
const Seller = require("../models/sellerModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const authSeller = require("../../middleware/authSeller");
const OTP = require('../../models/otpModel');
const nodemailer = require('nodemailer');
// ✅ Helper: Generate JWT
const generateToken = (sellerId) => {
  return jwt.sign({ id: sellerId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};



// 🔹 1️⃣ Send OTP via Email
router.post('/send-otp-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required!" });
        }

        // Generate a 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP in database (expires in 5 mins)
        await OTP.create({ email, otp: otpCode });

        // Set up Nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP Code",
            text: `Your OTP for verification is: ${otpCode}. It is valid for 5 minutes.`,
        };

        // Send email
        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: "OTP sent successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Error sending OTP", error: error.message });
    }
});

// ✅ @route   POST /api/sellers/signup
// ✅ @desc    Register a new seller
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, vendorName, address } = req.body;

    // Check if seller already exists
    const existing = await Seller.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Seller with this email or phone already exists" });
    }

    const newSeller = new Seller({
      name,
      email,
      phone,
      vendorName,
      password,
      address,
    });

    await newSeller.save();

    const token = generateToken(newSeller._id);

    res.status(201).json({
      message: "Seller registered successfully",
      token,
      seller: {
        id: newSeller._id,
        name: newSeller.name,
        email: newSeller.email,
        phone: newSeller.phone,
        vendorName: newSeller.vendorName,
      },
    });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ @route   POST /api/sellers/login
// ✅ @desc    Authenticate seller & get token
router.post("/login", async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    // Find seller by email or phone
    const seller = await Seller.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    }).select("+password");

    if (!seller) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await seller.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const token = generateToken(seller._id);

    res.json({
      token,
      seller: {
        id: seller._id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone,
        vendorName: seller.vendorName,
      },
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ @route   GET /api/sellers/me
// ✅ @desc    Get seller profile (protected)
router.get("/me", authSeller, async (req, res) => {
  try {
    res.json({
      id: req.seller._id,
      name: req.seller.name,
      email: req.seller.email,
      phone: req.seller.phone,
      vendorName: req.seller.vendorName,
      address: req.seller.address,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch seller data" });
  }
});


router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required!" });
        }

       const seller = await Seller.findOne({ email });
if (!seller) {
  return res.status(404).json({ message: "Seller not found!" });
}
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        await OTP.create({ email, otp: otpCode });

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Password Reset OTP",
            text: `Your OTP for password reset is: ${otpCode}. It is valid for 5 minutes.`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: "OTP sent successfully!" });

    } catch (error) {
        res.status(500).json({ message: "Error sending OTP", error: error.message });
    }
});

// 🔹 6️⃣ Verify OTP Route (Move Above module.exports)
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const otpRecord = await OTP.findOne({ email, otp });
        if (!otpRecord) {
            return res.status(400).json({ message: "Invalid or expired OTP!" });
        }

        res.status(200).json({ message: "OTP Verified Successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
router.post("/forgot-password/reset", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ message: "Missing fields" });

  try {
    const seller = await Seller.findOne({ email });
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    const salt = await bcrypt.genSalt(10);
    seller.password = newPassword; // assign plain password
await seller.save();           // pre-save hook will hash it

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ message: "Could not reset password" });
  }
});
module.exports = router;
