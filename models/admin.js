import mongoose from "mongoose";
import bcrypt from "bcrypt";

// User Schema with password hashing
const AdminSchema = mongoose.Schema({
  phone: {
    type: String,
    required: [true, "please add your phone"],
  },
  name: {
    type: String,
    required: [true, "please enter your username"],
  },
  password: {
    type: String,
    required: [true, "please enter a password"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
AdminSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Method to compare passwords
AdminSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);

export default Admin;