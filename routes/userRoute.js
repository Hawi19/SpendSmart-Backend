import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { SECRET_KEY } from "../authMiddleware.js";
import { User } from "../models/userModel.js";
import { verifyToken } from "../authMiddleware.js";
import { sendVerificationEmail } from "../mailer.js";

const router = express.Router();

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "This username or email already exists" });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username,
      email,
      password: hashPassword,
    });

    // Generate a verification token
    const token = jwt.sign(
      { id: newUser._id, type: "verification" },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    // Send verification email
    await sendVerificationEmail(email, token);

    return res
      .status(201)
      .json({ message: "User registered. Verification email sent." });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).send({ message: error.message });
  }
});

// Email Verification
router.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token is required." });
    }

    const decoded = jwt.verify(token, SECRET_KEY);
    if (decoded.type !== "verification") {
      return res.status(400).json({ message: "Invalid token type" });
    }

    const userId = decoded.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Log user before updating
    console.log("User before verification:", user);

    // Update user as verified
    user.isVerified = true;

    // Save the updated user
    await user.save();

    // Log user after saving
    console.log("User verified status after saving:", user.isVerified); // Should log true
    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Verification error:", error.message);
    return res.status(400).json({ message: "Invalid or expired token" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required." });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    console.log("User verification status during login:", user.isVerified);
    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Account not verified. Please verify your email." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign({ userId: user._id, type: "auth" }, SECRET_KEY, {
      expiresIn: "1h",
    });

    return res.status(200).json({ token, username: user.username });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Server error" });
  }
});

// Update Income Route
router.put("/income", verifyToken, async (req, res) => {
  const { totalIncome } = req.body;
  const userId = req.user.userId; // Extract userId from token

  try {
    if (typeof totalIncome !== "number" || totalIncome < 0) {
      return res.status(400).json({ message: "Invalid income value." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.totalIncome = totalIncome;
    await user.save();

    return res.status(200).json({
      message: "User income updated successfully.",
      user: {
        username: user.username,
        totalIncome: user.totalIncome,
      },
    });
  } catch (error) {
    console.error("Update income error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while updating income." });
  }
});

// Fetch Income Route
router.get("/income", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({ totalIncome: user.totalIncome });
  } catch (error) {
    console.error("Error fetching user income:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching income." });
  }
});

export default router;
