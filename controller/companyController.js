import Company from "../models/company.js"

// Function to check and insert default data if no company exists
const addDefaultCompany = async () => {
    const company = await Company.findOne({}); // Check if the company document exists
  
    if (!company) {
      // If no company document exists, create one with the default values
      const newCompany = new Company({
        // You can customize these values if you want
        logo: "",
        name: 'MAZAYA',
        address: "17 شارع , اسكندرية , مصر",
        taxNumber: "343354651",
        inventoryCalc: "LIFO",
        currancy: "EGP",
      });
  
      await newCompany.save(); // Save it to the database
      console.log("Default company created successfully!");
    } else {
      console.log("Company document already exists.");
    }
  };

export const updateCompany = async (req, res) => {
    // Call the function when your app starts
 await addDefaultCompany();
  try {
    const allowedFields = [
      "logo",
      "name",
      "address",
      "taxNumber",
      "inventoryCalc",
      "currancy",
    ];

    const sanitizedData = {};

    for (const key of allowedFields) {
      const value = req.body[key];

      // Block dangerous values (e.g., object injection)
      if (typeof value === "object" && value !== null) {
        return res.status(400).json({
          message: `Invalid value for field '${key}'`,
        });
      }

      if (value !== undefined) {
        sanitizedData[key] = value;
      }
    }

    const company = await Company.findOneAndUpdate(
      {},
      { $set: sanitizedData },
      { new: true, upsert: false }
    );

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json({
      message: "Company updated successfully",
      company,
    });
  } catch (error) {
    console.error("Update company error:", error);
    res.status(500).json({ message: "Server error while updating company" });
  }
};