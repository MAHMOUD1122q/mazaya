import express from "express"
import mongoose from "mongoose";
import "dotenv/config";
import ClientRoutes from "./routers/ClientRoutes.js";
const app = express()


app.use(express.json())
app.use(express.urlencoded({ extended: false }));

app.use("/api/v1/client" ,ClientRoutes)
app.get("/", (req, res) => {
  res.send("Hello"); 
});

const PORT = 4000

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

