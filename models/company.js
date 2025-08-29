import mongoose from "mongoose";

const companySchema = mongoose.Schema({
  logo: {
    type: String,
    default : ""
  },
  name: {
    type: String,
    default : 'MAZAYA'
  },
  address: {
    type: String,
    default : "17 شارع , اسكندرية , مصر"
  },
  taxNumber: {
    type: String,
    default : "343354651"
  },
  inventoryCalc: {
    type: String,
    default : "LIFO"
  },
  currancy: { type: String, default: "EGP" }, // New role field
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Company = mongoose.models.Company || mongoose.model("Company", companySchema);

export default Company;
