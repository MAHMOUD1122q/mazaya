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
    const product = await Product.findOne({ code: req.params.code }).select(
      "-__v -branches -_id -totalQuantity"
    );
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addProduct = async (req, res) => {
  try {
    const {
      productType,
      name,
      glassShape,
      glassMaterial,
      lensPower,
      lensType,
      lensColor,
      price,
      quantity,
      miami,
      glanklis,
      seyouf,
    } = req.body;

    // Basic validation
    if (!productType || !name || !price) {
      return res.status(400).json({
        success: false,
        message: "الرجاء إدخال جميع الحقول المطلوبة (نوع المنتج، الاسم، السعر)",
      });
    }

    if (!["lens", "glasses"].includes(productType)) {
      return res.status(400).json({
        success: false,
        message: "نوع المنتج يجب أن يكون عدسات أو نظارات",
      });
    }

    const newProduct = new Product({
      productType,
      name,
      glassShape: glassShape || null,
      glassMaterial: glassMaterial || null,
      lensPower: lensPower || null,
      lensType: lensType || null,
      lensColor: lensColor || null,
      price: parseFloat(price),
      quantity: quantity || 0,
      miami: miami || 0,
      glanklis: glanklis || 0,
      seyouf: seyouf || 0,
    });

    const savedProduct = await newProduct.save();

    res.status(201).json({
      success: true,
      message: `تم إضافة المنتج بنجاح - الكود: ${savedProduct.code}`,
      product: savedProduct,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إضافة المنتج",
      error: error.message,
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const { branch, search, productType } = req.query;

    // Build query
    let query = {};

    // Validate and apply product type filter
    if (productType) {
      const validTypes = ["lens", "glasses"];
      if (!validTypes.includes(productType.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: "Invalid product type. Valid types are: lens, glasses",
        });
      }
      query.productType = productType.toLowerCase();
    }

    // Search by name or code
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { code: new RegExp(search, "i") },
      ];
    }

    // Validate branch
    const validBranches = ["miami", "glanklis", "seyouf"];
    if (branch && !validBranches.includes(branch.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid branch. Valid branches are: miami, glanklis, seyouf",
      });
    }

    // Fetch products
    const products = await Product.find(query).sort({ createdAt: -1 });

    // Format products
    const formattedProducts = products.map((product) => {
      const base = {
        _id: product._id,
        code: product.code,
        productType: product.productType,
        productTypeArabic: product.productType === "lens" ? "عدسات" : "نظارات",
        category: product.category,
        name: product.name,
        price: product.price,
        details:
          product.productType === "glasses"
            ? {
                glassShape: product.glassShape,
                glassMaterial: product.glassMaterial,
              }
            : {
                lensPower: product.lensPower,
                lensType: product.lensType,
                lenscolor: product.lenscolor,
              },
        totalQuantity: product.quantity,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };

      if (branch) {
        return {
          ...base,
          selectedBranch: {
            name: branch.toLowerCase(),
            nameArabic: getBranchNameArabic(branch.toLowerCase()),
            quantity: product[branch.toLowerCase()],
          },
        };
      } else {
        return {
          ...base,
          branches: [
            {
              name: "miami",
              nameArabic: "ميامي",
              quantity: product.miami,
            },
            {
              name: "glanklis",
              nameArabic: "جلانكليس",
              quantity: product.glanklis,
            },
            {
              name: "seyouf",
              nameArabic: "السيوف",
              quantity: product.seyouf,
            },
          ],
        };
      }
    });

    // Summary
    const summary = {
      totalProducts: formattedProducts.length,
      lensCount: formattedProducts.filter((p) => p.productType === "lens").length,
      glassesCount: formattedProducts.filter((p) => p.productType === "glasses").length,
      totalInventoryValue: formattedProducts.reduce(
        (sum, p) => sum + p.price * p.totalQuantity,
        0
      ),
    };

    if (branch) {
      summary.branchInventoryValue = formattedProducts.reduce(
        (sum, p) => sum + p.price * p.selectedBranch.quantity,
        0
      );
    }

    res.status(200).json({
      success: true,
      count: formattedProducts.length,
      summary,
      filters: {
        branch: branch || null,
        search: search || null,
        productType: productType || null,
      },
      data: formattedProducts,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "خطأ في الخادم أثناء جلب المنتجات",
      error: error.message,
    });
  }
};

// Helper function
function getBranchNameArabic(name) {
  const map = {
    miami: "ميامي",
    glanklis: "جلانكليس",
    seyouf: "السيوف",
  };
  return map[name] || name;
}
// Helper function to get Arabic branch names
const getBranchNameArabic = (branchName) => {
  const branchNames = {
    miami: "ميامي",
    glanklis: "جلانكليس",
    seyouf: "السيوف",
  };
  return branchNames[branchName] || branchName;
};
