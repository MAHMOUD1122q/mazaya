// models/Product.js
import mongoose from "mongoose";

const productSchema = mongoose.Schema({
  code : String,
  category : String,
  name:{
    type: String,
    required: true,
  },
  branch:[
    {
      branchName : String,
      quantity : Number
    }
  ],
  totalQuantity:Number ,
  minQuantity: {
    type: Number,
    default: 10,
  },
});

const Product = mongoose.model("Product", productSchema);
export default Product; 