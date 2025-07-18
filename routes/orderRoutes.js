import express from "express"
import { addExpenses, addOrder, addPaymentToOrder, cancelOrder, getCliant, getExpencess, getOrderByCode, getOrders, getRefundOrdersToday, getReports, labOrders, orderReady, refundOrder, reportPayment, updateOrder, updateOrderStatus } from "../controller/orderController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.post("/add-order",authenticate , addOrder)
router.get("/get-orders" ,authenticate , getOrders)
router.get("/get-order/:code" ,authenticate , getOrderByCode)
router.post("/complete-amount/:code" ,authenticate , addPaymentToOrder)
router.post("/refund/:code" ,authenticate , refundOrder)
router.delete("/cancel-order/:code" ,authenticate , cancelOrder)
router.get("/get-lab-orders" , authenticate , labOrders)
router.post("/ready-lab-order/:code" , authenticate , orderReady)
router.put("/update-order/:order_code" , authenticate , updateOrder)
router.get("/get-client" , authenticate , getCliant)
router.get("/order-reports" , authenticate , getReports)
router.post("/add-expenses" , authenticate , addExpenses)
router.get("/get-expenses" , authenticate , getExpencess)
router.get("/payment-summary" , authenticate , reportPayment)
router.get("/get-refund" , authenticate , getRefundOrdersToday)
router.put("/update/:code/status" , authenticate , updateOrderStatus)

export default router 
