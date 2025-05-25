import express from "express"
import { addOrder } from "../controller/orderController.js"
import { addProduct, getByCode, getProducts } from "../controller/productController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.get("/get-product/:code", authenticate  , getByCode)
router.post("/add-product", authenticate  , addProduct)
router.get("/get-product", authenticate  , getProducts)

export default router 