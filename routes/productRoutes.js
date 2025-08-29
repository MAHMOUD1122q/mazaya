import express from "express"
import { addOrder } from "../controller/orderController.js"
import { addProduct, getByCode, getProducts } from "../controller/productController.js"
import { authenticate } from "../middlewares/auth.js"
import Papa from "papaparse"
import multer from "multer";
const router = express.Router()
import Product from "../models/product.js";
import XLSX from 'xlsx';
// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if file is CSV or Excel
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/csv',
      'text/plain'
    ];
    
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV and Excel files (.csv, .xls, .xlsx) are allowed!"), false);
    }
  },
});
router.get("/get-product/:code", authenticate  , getByCode)
router.post("/add-product", authenticate  , addProduct)
router.get("/get-product", authenticate  , getProducts)

const convertExcelToCSV = (buffer) => {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to CSV format
    const csvData = XLSX.utils.sheet_to_csv(worksheet);
    return csvData;
  } catch (error) {
    throw new Error(`Error converting Excel file: ${error.message}`);
  }
};

const processFileData = async (fileBuffer, originalname) => {
  return new Promise((resolve, reject) => {
    try {
      let csvData;
      
      // Determine file type and convert to CSV if needed
      const fileExtension = originalname.toLowerCase().substring(originalname.lastIndexOf('.'));
      
      if (fileExtension === '.csv') {
        csvData = fileBuffer.toString("utf8");
      } else if (fileExtension === '.xls' || fileExtension === '.xlsx') {
        csvData = convertExcelToCSV(fileBuffer);
      } else {
        throw new Error("Unsupported file format");
      }

      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        encoding: "utf8",
        complete: async (results) => {
          try {
            if (results.errors.length > 0) {
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
                let price = 0 ;
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
                  price: price || null,
                };

                // Map fields based on product type
                if (productType === 'glasses') {
                  productData.name = cleanRow['اسم الصنف'] || null;
                  productData.glassShape = cleanRow['الشكل'] || null;
                  productData.glassMaterial = cleanRow['المادة'] || null;
                  productData.lensType = null;
                  productData.lensPower = null;
                  productData.lenscolor = null;
                } else if (productType === 'lens') {
                  productData.name = cleanRow['اسم الصنف'] || null;
                  productData.lensType = cleanRow['نوع العدسة'] || null;
                  productData.lensPower = cleanRow['قوة العدسة'] || null;
                  productData.lenscolor = cleanRow['اللون'] || null;
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
    } catch (error) {
      reject(error);
    }
  });
};

// Updated route handler
router.post("/upload-products", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    // Get file extension for logging
    const fileExtension = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));
    const result = await processFileData(req.file.buffer, req.file.originalname);
    
    res.status(200).json({
      success: true,
      message: `file processed successfully`,
      data: result,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({
      success: false,
      message: "Error processing file",
      error: error.message
    });
  }
});


export default router 
