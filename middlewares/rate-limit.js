
import rateLimit from "express-rate-limit";

 export  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    max: 10, // Limit each IP to 100 requests per windowMs
    message: { error: "Too many requests, please try again later." },
    headers: true,
  });
  
  // Rate limiting middleware
 export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 5 requests per windowMs
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  // Using express-rate-limit
 export const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // Max 3 requests per windowMs
    message: { error: "Too many requests, please try again later." },
  });