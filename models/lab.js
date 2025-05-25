import mongoose from "mongoose";
import bcrypt from "bcrypt";

// User Schema with password hashing
const labSchema = mongoose.Schema({
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
labSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Method to compare passwords
labSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

const Lab = mongoose.models.Lab || mongoose.model("Lab", labSchema);

export default Lab;