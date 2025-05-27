import mongoose from "mongoose";
// User Schema with password hashing
const expensesSchema = mongoose.Schema({
  LicenseNumber: {
    type: Number,
  },
  date: {
   type: Date,
  },
  type: {
    type: String,
  },
  price: {
    type: Number,
  },
    branch: {
    type: String,
    default: ""
  },
  user: {
    type: String,
  },
  notes: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Expenses = mongoose.model("Expenses", expensesSchema);

export default Expenses;