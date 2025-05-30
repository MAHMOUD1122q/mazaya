import express from "express"
import { addProduct, getByCode, getProducts } from "../controller/productController.js"
import { authenticate } from "../middlewares/auth.js"
import { addUser, deleteUser, getAllAccounts, getProfile, updateUser } from "../controller/userController.js"

const router = express.Router()

router.get("/get-profile", authenticate  , getProfile)
router.get("/get-users", authenticate  , getAllAccounts)
router.post("/add-user", authenticate  , addUser)
router.delete('/delete-user/:id', deleteUser);
router.put('/update-user/:id', updateUser);


export default router 