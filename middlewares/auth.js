import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.ACCESS_SECRET || "access_secret_key";

export const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    jwt.verify(token, ACCESS_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: "Invalid token" });
        }

        req.user = decoded.user; // Attach user data to request
        next(); // Proceed to the next middleware/route
    });
};

export const isNotAdmin = (req, res, next) => {
    const roles = req.user?.user?.role;
    if (!Array.isArray(roles) || !roles.includes("admin")) {
      return res.status(403).json({ message: "Access denied. Admins only!" });
    }
    next();
  };