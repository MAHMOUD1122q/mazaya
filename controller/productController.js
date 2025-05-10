import Product from "../models/product.js";


// GET product by code
export const getByCode = async (req, res) => {
  try {
    const product = await Product.findOne({ code: req.params.code });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}