import mongoose from "mongoose";
const ClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    sessionToken: { type: String },
    // notifications : [

    // ],
    otp: { type: String },
    otpExpires: { type: Date },
  },
  { timestamps: true } // Correct option for createdAt and updatedAt
);

const Client = mongoose.models.Client || mongoose.model("Client", ClientSchema);

export default Client;
