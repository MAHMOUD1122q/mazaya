import express from "express"
import { addProduct, getByCode, getProducts } from "../controller/productController.js"
import { authenticate, authorizeRole } from "../middlewares/auth.js"
import { addUser, deleteUser, getAllAccounts, getProfile, updateUser } from "../controller/userController.js"

const router = express.Router()

router.get("/get-profile", authenticate  , getProfile)
router.get("/get-users", authenticate ,  authorizeRole("admin")  , getAllAccounts)
router.post("/add-user", authenticate ,   authorizeRole("admin") , addUser)
router.delete('/delete-user/:id' ,authenticate,authorizeRole("admin"), deleteUser);
router.put('/update-user/:id', authenticate,authorizeRole("admin"), updateUser);


export default router 
