import Lab from "../models/lab.js";
import User from "../models/user.js";

// GET PROFILE CONTROLLER
export const getProfile = async (req, res) => {
  try {
    const { id, type } = req.user;

    let user;
    if (type === "user") {
      user = await User.findById(id).select("-password -createdAt -lastLogin -code -_id");
    } else if (type === "lab") {
      user = await Lab.findById(id).select("-password -createdAt -lastLogin -code -_id");
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
    const users = await User.find().select("-password -lastLogin -createdAt -_id -code -branch");
    const labs = await Lab.find().select("-password -lastLogin -createdAt -_id -code");

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

export const addUser = async (req, res) => {
  const { name, phone, password, role , branch ,code } = req.body;

  // Validate input
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    let newUser;

    if (role === "user") {
      // Store in User collection
      if(!branch) {
        return res.status(400).json({message : "branch is required"})
      }
      newUser = new User({ name, phone, password , branch ,code });
      await newUser.save();
    } else if (role === "lab") {
      // Store in Lab collection
      newUser = new Lab({ name, phone, password , code });
      await newUser.save();
    } else {
      return res.status(400).json({ message: "Invalid role value" });
    }

    res.status(201).json({ message: "User created successfully"});

  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "ID is required" });
  }

  try {
    // Try to delete from User collection first
    let deletedUser = await User.findByIdAndDelete(id);

    // If not found in User, try in Lab
    if (!deletedUser) {
      deletedUser = await Lab.findByIdAndDelete(id);
    }

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const updateUser = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!id) {
    return res.status(400).json({ message: "ID is required" });
  }

  try {
    // Try updating in User collection first
    let updatedUser = await User.findByIdAndUpdate(id, updates, { new: true });

    // If not found, try in Lab collection
    if (!updatedUser) {
      updatedUser = await Lab.findByIdAndUpdate(id, updates, { new: true });
    }

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully"});
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error" });
  }
};
