import express from "express";
import { updateCompany } from "../controller/companyController.js";
const router = express.Router();

router.put("/update", updateCompany);

export default router;
