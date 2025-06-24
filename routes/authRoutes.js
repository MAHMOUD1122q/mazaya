import express from "express";
import { body } from "express-validator";
import {login, loginLab, logout } from "../controller/authController.js";
// import { authenticate } from "../middlewares/auth.js";
import { loginLimiter } from "../middlewares/rate-limit.js";
const router = express.Router();


router.post("/login" , loginLimiter, login);
router.post("/lab-login" , loginLimiter, loginLab);
router.post("/logout", logout);


export default router;
