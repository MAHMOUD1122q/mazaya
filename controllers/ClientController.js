import Client from "../models/Client.js";
import { loginSchema, registerSchema } from "../schemas/clientValidation.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const generateOTP = () => {
  // Generate 3 random bytes → convert to int → pad to 6 digits
  const otp = (parseInt(crypto.randomBytes(3).toString("hex"), 16) % 1000000)
    .toString()
    .padStart(6, "0");
  return otp;
};
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

export const register = async (req, res) => {
  try {
    // validate inputs
    await registerSchema.validate(req.body, { abortEarly: false });

    const { name, phone, location } = req.body;

    // check if phone already exists
    const existing = await Client.findOne({ phone });

    if (existing) {
      return res.status(400).json({ message: "Phone already registered" });
    }

    const client = new Client({
      name,
      phone,
      location,
    });


    // create JWT token
    const token = jwt.sign(
      { id: client._id, phone: client.phone },
      JWT_SECRET,
      { expiresIn: "1y" }
    );
    await client.save();

    res.status(200).json({
      message: "Client registered successfully",
      client: { id: client._id, name: client.name, phone: client.phone },
      token,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "ValidationError" , errors: err.errors });
    }
    res.status(500).json({ message: err.message });
  }
};

export const loginRequestOTP = async (req, res) => {
  try {
    await loginSchema.validate(req.body, { abortEarly: false });

    const { phone } = req.body;

    const client = await Client.findOne({ phone });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // generate secure OTP
    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // valid for 5 minutes

    client.otp = otp;
    client.otpExpires = expiry;

    await client.save();

    res.status(200).json({ message: "OTP sent to your phone" , otp });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ errors: err.errors });
    }
    res.status(500).json({ message: err.message });
  }
}; 


export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const client = await Client.findOne({ phone });

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    if (!client.otp || client.otp !== otp || client.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    client.otp = null;
    client.otpExpires = null;


    // Generate JWT
    const token = jwt.sign(
      { id: client._id, phone: client.phone },
      JWT_SECRET,
      { expiresIn: "1y" }
    );
client.sessionToken = token;
    await client.save();
    res.status(200).json({
      message: "Login successful",
      client: { id: client._id, name: client.name, phone: client.phone },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};