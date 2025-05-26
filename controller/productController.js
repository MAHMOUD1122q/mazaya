import Order from "../models/orders.js";
import Product from "../models/product.js";
const generateProductCode = () => {
  const prefix = "PRD";
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${randomPart}`;
};


// GET product by code
export const getByCode = async (req, res) => {
  try {
    const product = await Product.findOne({ code: req.params.code }).select("-__v -branches -_id -totalQuantity");
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export const addProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      totalQuantity,
      quantityMiami,
      quantityGlanklis,
      quantitySeyouf,
      price
    } = req.body;

    if (
      !name ||
      !category ||
      quantityMiami == null ||
      quantityGlanklis == null ||
      quantitySeyouf == null
    ) {
      return res.status(400).json({
        message: "Please fill in name, category, and all branch quantities.",
      });
    }

    const calculatedTotal =
      Number(quantityMiami) + Number(quantityGlanklis) + Number(quantitySeyouf);

    const finalTotal = totalQuantity != null ? totalQuantity : calculatedTotal;

    const newProduct = new Product({
      name,
      category,
      code: generateProductCode(),
      totalQuantity: finalTotal,
      branches: {
        miami: quantityMiami,
        glanklis: quantityGlanklis,
        seyouf: quantitySeyouf,
      },
      price
    });

    await newProduct.save();

    res.status(201).json({
      message: "Product added successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ message: "Server error" });
  }
};
export const getProducts = async (req, res) => {
  try {
    const { branch , search } = req.query;
    
    // Build the query object
    let query = {};
    
    
    // 🔍 Search by name or code using a single search string
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { code: new RegExp(search, "i") }
      ];
    }
    
    // Filter by branch quantity if branch is specified
    if (branch) {
      const validBranches = ['miami', 'glanklis', 'seyouf'];
      if (!validBranches.includes(branch.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: "Invalid branch. Valid branches are: miami, glanklis, seyouf"
        });
      }
      
      
    }
    
    // Get products from database
    const products = await Product.find(query);
    
    // Format the response based on whether branch filter is applied
    let formattedProducts;
    
    if (branch) {
      // If specific branch is requested, highlight that branch's quantity
      formattedProducts = products.map(product => ({
        _id: product._id,
        code: product.code,
        category: product.category,
        name: product.name,
        selectedBranch: {
          name: branch.toLowerCase(),
          quantity: product.branches[branch.toLowerCase()]
        },
        totalQuantity: product.totalQuantity
      }));
    } else {
      // If no specific branch, show all branch quantities
      formattedProducts = products.map(product => ({
        _id: product._id,
        code: product.code,
        category: product.category,
        name: product.name,
        branches: {
          miami: product.branches.miami,
          glanklis: product.branches.glanklis,
          seyouf: product.branches.seyouf
        },
        totalQuantity: product.totalQuantity
      }));
    }
    
    res.status(200).json({
      success: true,
      count: formattedProducts.length,
      data: formattedProducts
    });
    
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
      error: error.message
    });
  }
}
