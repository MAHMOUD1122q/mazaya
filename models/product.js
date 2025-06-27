import mongoose from "mongoose";

const productSchema = mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
    },
    productType: {
      type: String,
      required: true,
      enum: ["lens", "glasses"],
    },
    name: {
      type: String,
      required: true,
    },
    glassShape: String,
    glassMaterial: String,
    lensPower: String,
    lensType: String,
    lenscolor: String,
    price: {
      type: Number,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    miami: {
      type: Number,
      required: true,
      default: 0,
    },
    glanklis: {
      type: Number,
      required: true,
      default: 0,
    },
    seyouf: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Only generate product code
productSchema.pre("save", async function (next) {
  if (!this.code) {
    const prefix = this.productType === "lens" ? "LNS00" : "SHM00";

    const latestProduct = await mongoose
      .model("Product")
      .findOne({ code: { $regex: `^${prefix}` } })
      .sort({ code: -1 });

    let nextNumber = 1;
    if (latestProduct) {
      const currentNumber = parseInt(latestProduct.code.replace(prefix, ""));
      nextNumber = currentNumber + 1;
    }

    this.code = prefix + nextNumber.toString().padStart(3, "0");
  }

  next();
});

const Product = mongoose.model("Product", productSchema);
export default Product;
