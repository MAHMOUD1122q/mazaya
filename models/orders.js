import mongoose from 'mongoose';

// Define the Order Schema
const orderSchema = new mongoose.Schema({
  customer_name: {
    type: String,
  },
  customer_phone : {
    type : String
  } ,
  order_code: {
    type: String,
    unique : true
  },
  seller_name : {
    type : String
  },
  branch: {
    type: String,
  },
  type: {
    type: String,
    enum: ['ready', 'In progress', 'Reserved' ,'Delivered', "lab"], // Restrict types of orders
  },
  date: {
    type: Date,
    default: Date.now, // Automatically set the current date if not provided
  },
  total_price: {
    type: Number,
    required: true, // Total price of the order is required
    min: 0, // Ensure the price is not negative
  },
  order_details: [{
    item_code : String ,
    glasses_type : String ,

    quantity: { 
      type: Number, 
      default : 1,
    },
    Endurance : String ,
    lenticular_left_cost: Number ,
    lenticular_right_cost : Number,
    lenticular_price : String,
    lab : Number , 
    glassPrice: { 
      type: Number, 
    },
    glassDetails : {
       type: Object, 
    },
  }],
   notes : String,
  payment : [
    {
      PaymentDone : Number,
      Balance :Number ,
      payment_method : String,
      bank : String,
      code : Number,
      method : String,
      discount : Number
    }
  ],
  status : {
    type : String,
    default : "lab"
  },
  reason : String,
  labNotes : String
});

// Create the Order model from the schema
const Order = mongoose.model('Order', orderSchema);

export default Order;