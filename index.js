import express from "express";
import {limiter} from "./middlewares/rate-limit.js";
import helmet from "helmet";
import path  from "path"
import { fileURLToPath } from "url";
import authRouter from "./routes/authRoutes.js";
import companyRouter from "./routes/companyRoutes.js";
import orderRouter from "./routes/orderRoutes.js";
import productRouter from "./routes/productRoutes.js";
import notificationRouter from "./routes/notifictaionRoutes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import mongoose from "mongoose";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, "public"))); // Serve robots.txt from the public folder
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(limiter);
app.use(helmet()); // Enables all Helmet security features with default settings

app.use(cors({ origin: true, credentials: true }));

const PORT = process.env.PORT || 3000;

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/company", companyRouter);
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/product", productRouter);


app.get("/", (req, res) => {
res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.send("Hello"); 
});

try {
  mongoose
    .connect(process.env.DB_SECRET)
    .then(console.log("connect to Database"))
    .then(
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      })
    );
} catch (e) {
  console.log(e);
}
