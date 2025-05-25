import express from "express"
import { addOrder, getOrders } from "../controller/orderController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.post("/add-order" , addOrder)
router.get("/get-orders" ,authenticate , getOrders)

export default router 