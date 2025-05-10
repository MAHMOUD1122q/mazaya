import express from "express"
import { addOrder } from "../controller/orderController.js"
import { getByCode } from "../controller/productController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.get("/get-product/:code", authenticate  , getByCode)

export default router 