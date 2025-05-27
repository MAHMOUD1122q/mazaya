import express from "express"
import { addProduct, getByCode, getProducts } from "../controller/productController.js"
import { authenticate } from "../middlewares/auth.js"
import { getAllAccounts, getProfile } from "../controller/userController.js"

const router = express.Router()

router.get("/get-profile", authenticate  , getProfile)
router.get("/get-users", authenticate  , getAllAccounts)

export default router 