import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import RefreshToken from "../models/token.js";
import User from "../models/user.js";
import Lab from "../models/lab.js";

const ACCESS_SECRET = process.env.ACCESS_SECRET || "access_secret_key";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "refresh_secret_key";
// Generate tokens with minimal payload
const generateAccessToken = (user) => {
  return jwt.sign({ user }, ACCESS_SECRET, { expiresIn: "12h" });
};
const generateRefreshToken = (user) => {
  return jwt.sign({ user }, REFRESH_SECRET, { expiresIn: "7d" });
};

export const login = async (req, res) => {
  try {
    const { name, code, branch, phone, password } = req.body;

    // Validate required fields
    if (!phone || !name || !password || !code || ! branch) {
      return res.status(400).json({ message: "Phone, name, password , branch and code are required" });
    }

    // Find user by code
    const user = await User.findOne({ code });
    if (!user) {
      // Simulate delay to prevent timing attacks
      await bcrypt.hash("dummy", 10);
      return res.status(401).json({ message: "Invalid credentials" });
    }

        // Verify all provided fields
    if (
      user.name !== name ||
      user.phone !== phone ||
      user.branch  !== branch 
    ) {
      // Simulate delay to prevent timing attacks
      await bcrypt.hash("dummy", 10);
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // Check if password is hashed (starts with $2b$)
    const isLikelyHashed = typeof user.password === "string" && user.password.startsWith("$2b$") ||  user.password.startsWith("$2a$")
    let isMatch = false;

    if (isLikelyHashed) {
      // Compare with hashed password
      isMatch = await user.comparePassword(password);
    } else {
      // Compare with plaintext password
      isMatch = user.password === password;
      if (isMatch) {
        // Hash the password and update the user
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.updateOne(
          { _id: user._id },
          { password: hashedPassword }
        );
      }
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate tokens
    const payload = { id: user._id, name: user.name , branch , type: "user"  };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token
    await RefreshToken.findOneAndUpdate(
      { phone: user.phone },
      { token: refreshToken },
      { upsert: true, new: true }
    );

    // Update lastLogin
    await User.updateOne(
      { _id: user._id },
      { lastLogin: new Date() }
    );

    // Send response
    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        branch: user.branch,
        code: user.code,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const loginLab = async (req, res) => {
  try {
    const { name, code, phone, password } = req.body;

    // Validate required fields
    if (!phone || !name || !password) {
      return res.status(400).json({ message: "Phone, name, and password are required" });
    }

  // Find user by code
    const user = await Lab.findOne({ code });
    if (!user) {
      // Simulate delay to prevent timing attacks
      await bcrypt.hash("dummy", 10);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Verify all provided fields
    if (
      user.name !== name ||
      user.phone !== phone 
    ) {
      // Simulate delay to prevent timing attacks
      await bcrypt.hash("dummy", 10);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if password is hashed (starts with $2b$)
    const isLikelyHashed = typeof user.password === "string" && user.password.startsWith("$2b$") ||  user.password.startsWith("$2a$")
    let isMatch = false;

    if (isLikelyHashed) {
      // Compare with hashed password
      isMatch = await user.comparePassword(password);
    } else {
      // Compare with plaintext password
      isMatch = user.password === password;
      if (isMatch) {
        // Hash the password and update the user
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.updateOne(
          { _id: user._id },
          { password: hashedPassword }
        );
      }
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate tokens
    const payload = { id: user._id, name: user.name , type: "lab" };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token
    await RefreshToken.findOneAndUpdate(
      { phone: user.phone },
      { token: refreshToken },
      { upsert: true, new: true }
    );

    // Update lastLogin
    await User.updateOne(
      { _id: user._id },
      { lastLogin: new Date() }
    );

    // Set refresh token cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Send response
    res.json({
      message: "Login successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        branch: user.branch,
        code: user.code,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
export const refreshToken = async (req, res) => {
  try {
   const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(401).json({ message: "Refresh token not found" });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(token, REFRESH_SECRET);
    } catch (err) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const existingToken = await RefreshToken.findOne({ token });
    if (!existingToken) {
      return res.status(403).json({ message: "Refresh token not recognized" });
    }

    // Identify user (based on type)
    const { id, name, type } = decoded.user;
    let user;

    if (type === "user") {
      user = await User.findById(id);
    } else if (type === "lab") {
      user = await Lab.findById(id); // Make sure you import Lab model too
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newAccessToken = generateAccessToken({
      id: user._id,
      name: user.name,
      branch: user.branch,
      type,
    });

    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// LOGOUT CONTROLLER
export const logout = async (req, res) => {
  try {
     const { refreshToken: token } = req.body;

    if (refreshToken) {
      // Remove token from database
      await RefreshToken.deleteOne({ token: refreshToken });
    }

    // Clear cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "Strict",
      secure: process.env.NODE_ENV === "production",
    });

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
