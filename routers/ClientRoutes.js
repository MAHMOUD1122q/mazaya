import express from "express"
import { loginRequestOTP, register, verifyOTP } from "../controllers/ClientController.js";
import { loginLimiter } from "../middlewares/rate-limit.js";

const router = express.Router();


router.post("/register",  register)
router.post("/login", loginLimiter, loginRequestOTP)
router.post("/verify", loginLimiter, verifyOTP)


export default router