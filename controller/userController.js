import Lab from "../models/lab.js";
import User from "../models/user.js";

// GET PROFILE CONTROLLER
export const getProfile = async (req, res) => {
  try {
    const { id, type } = req.user;

    let user;
    if (type === "user") {
      user = await User.findById(id).select("-password");
    } else if (type === "lab") {
      user = await Lab.findById(id).select("-password");
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      user: {
        ...user.toObject(),
        type,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAllAccounts = async (req, res) => {
  try {
    // Fetch all users and labs
    const users = await User.find().select("-password");
    const labs = await Lab.find().select("-password");

    // Append type to each document
    const formattedUsers = users.map(user => ({
      ...user.toObject(),
      type: "user"
    }));

    const formattedLabs = labs.map(lab => ({
      ...lab.toObject(),
      type: "lab"
    }));

    // Combine all
    const allAccounts = [...formattedUsers, ...formattedLabs];

    res.json({ accounts: allAccounts });
  } catch (error) {
    console.error("Get all accounts error:", error);
    res.status(500).json({ message: "Server error" });
  }
};