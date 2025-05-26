import express from "express"
import { addOrder, addPaymentToOrder, cancelOrder, getOrderByCode, getOrders, labOrders, orderReady, refundOrder, updateOrder } from "../controller/orderController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.post("/add-order" , addOrder)
router.get("/get-orders" ,authenticate , getOrders)
router.get("/get-order/:code" ,authenticate , getOrderByCode)
router.post("/complete-amount/:code" ,authenticate , addPaymentToOrder)
router.post("/refund/:code" ,authenticate , refundOrder)
router.delete("/cancel-order/:code" ,authenticate , cancelOrder)
router.get("/get-lab-orders" , authenticate , labOrders)
router.post("/ready-lab-order/:code" , authenticate , orderReady)
router.put("/update-order/:code" , authenticate , updateOrder)

export default router 