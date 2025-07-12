import express from "express"
import { addOrder } from "../controller/orderController.js"
import { addProduct, getByCode, getProducts } from "../controller/productController.js"
import { authenticate } from "../middlewares/auth.js"
import Papa from "papaparse"
import multer from "multer";
const router = express.Router()
import Product from "../models/product.js";
// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is CSV
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed!"), false);
    }
  },
});

router.get("/get-product/:code", authenticate  , getByCode)
router.post("/add-product", authenticate  , addProduct)
router.get("/get-product", authenticate  , getProducts)
// Function to process CSV data
const processCSVData = async (csvData) => {
  return new Promise((resolve, reject) => {
    Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      encoding: "utf8",
      complete: async (results) => {
        try {
          if (results.errors.length > 0) {
            console.error("CSV parsing errors:", results.errors);
            return reject(new Error("CSV parsing failed"));
          }

          const products = results.data;
          let successCount = 0;
          let errorCount = 0;
          const errors = [];

          for (let i = 0; i < products.length; i++) {
            try {
              const row = products[i];
              
              // Clean and trim headers to handle any whitespace issues
              const cleanRow = {};
              Object.keys(row).forEach(key => {
                const cleanKey = key.trim();
                cleanRow[cleanKey] = row[key];
              });

              // Determine product type based on النوع column
              const productTypeRaw = cleanRow['النوع']?.toString().toLowerCase().trim();
              
              let productType = '';
              if (productTypeRaw === 'glasses' || productTypeRaw === 'نضاره' || productTypeRaw === 'نضارة') {
                productType = 'glasses';
              } else if (productTypeRaw === 'lens' || productTypeRaw === 'عدسه' || productTypeRaw === 'عدسة') {
                productType = 'lens';
              }

              // Parse price with better error handling
              let price = 0;
              const priceValue = cleanRow['السعر'];
              if (priceValue !== null && priceValue !== undefined && priceValue !== '') {
                const parsedPrice = parseFloat(priceValue);
                if (!isNaN(parsedPrice) && parsedPrice > 0) {
                  price = parsedPrice;
                }
              }

              let productData = {
                productType: productType,
                quantity: parseInt(cleanRow['الكمية']) || 0,
                miami: parseInt(cleanRow['كمية فرع ميامي']) || 0,
                glanklis: parseInt(cleanRow['كمية فرع جانكليس']) || 0,
                seyouf: parseInt(cleanRow['كمية فرع السيوف']) || 0,
                price: price,
              };

              // Map fields based on product type
              if (productType === 'glasses') {
                productData.name = cleanRow['اسم الصنف'] || null;
                productData.glassShape = cleanRow['الشكل'] || null;
                productData.glassMaterial = cleanRow['المادة'] || null;
                // Set lens-specific fields to null for glasses
                productData.lensType = null;
                productData.lensPower = null;
                productData.lenscolor = null;
              } else if (productType === 'lens') {
                productData.name = cleanRow['اسم الصنف'] || null;
                productData.lensType = cleanRow['نوع العدسة'] || null;
                productData.lensPower = cleanRow['قوة العدسة'] || null;
                productData.lenscolor = cleanRow['اللون'] || null;
                // Set glass-specific fields to null for lenses
                productData.glassShape = null;
                productData.glassMaterial = null;
              }

              // Validate required fields
              if (!productData.name || productData.name.trim() === '') {
                throw new Error(`Invalid data: missing product name`);
              }

              if (!productType) {
                throw new Error(`Invalid data: unknown product type "${productTypeRaw}"`);
              }

              // More flexible price validation - allow zero prices but warn
              if (price <= 0) {
                console.warn(`Warning: Product "${productData.name}" has price ${price}`);
              }

              // Create and save the product
              const product = new Product(productData);
              await product.save();
              
              successCount++;
              
            } catch (error) {
              errorCount++;
              errors.push({
                row: i + 1,
                error: error.message,
                data: products[i] // Use original row data for debugging
              });
              
              // Log detailed error for debugging
              console.error(`Error processing row ${i + 1}:`, error.message, products[i]);
            }
          }

          resolve({
            success: true,
            totalRows: products.length,
            successCount,
            errorCount,
            errors: errors.slice(0, 10)
          });

        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};
router.post("/upload-products", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No CSV file uploaded"
      });
    }
    const csvData = req.file.buffer.toString("utf8");
    const result = await processCSVData(csvData);
    res.status(200).json({
      success: true,
      message: "CSV file processed successfully",
      data: result,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error("Error processing CSV:", error);
    res.status(500).json({
      success: false,
      message: "Error processing CSV file",
      error: error.message
    });
  }
});

export default router 
