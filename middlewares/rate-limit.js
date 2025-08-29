import rateLimit from "express-rate-limit";

// limit login/otp attempts: 5 requests per 5 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 5, 
  message: {
    message: "Too many login attempts, please try again later",
  },
  standardHeaders: true, // send RateLimit-* headers
  legacyHeaders: false,
});