import Client from "../models/Client";
import jwt from "jsonwebtoken";
// const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");
    const client = await Client.findById(decoded.id);

    if (!client || client.sessionToken !== token) {
      return res.status(401).json({ message: "Invalid or expired session" });
    }

    req.client = client;
    next();
  } catch (err) {
    res.status(401).json({ message: "Unauthorized" });
  }
};