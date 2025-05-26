// models/Product.js
import mongoose from "mongoose";

const productSchema = mongoose.Schema({
  code : String,
  category : String,
  name:{
    type: String,
    required: true,
  },
   branches: {
    miami: { type: Number, required: true },
    glanklis: { type: Number, required: true },
    seyouf: { type: Number, required: true },
  },
  price : { type: Number, required: true },
  totalQuantity:Number ,
});

const Product = mongoose.model("Product", productSchema);
export default Product; 