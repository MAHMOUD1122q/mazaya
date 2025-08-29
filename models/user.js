import mongoose from "mongoose";
import bcrypt from "bcrypt";

// User Schema with password hashing
const userSchema = mongoose.Schema({
  phone: {
    type: String,
    required: [true, "please add your phone"],
  },
  name: {
    type: String,
    required: [true, "please enter your username"],
  },
  branch: {
    type: String,
    default: ""
  },
  password: {
    type: String,
    required: [true, "please enter a password"],
  },
  code: {
    type: String,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;