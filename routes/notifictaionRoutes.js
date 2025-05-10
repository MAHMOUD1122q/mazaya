import express from "express"
import { addNoti } from "../controller/notificationsController.js"


const router = express.Router()

router.post("add" , addNoti)


export default router