import mongoose from "mongoose";
import User from "../models/user.js";
import Notification from "../models/notifications.js";
import Product from "../models/product.js";


// Centralized MongoDB connection function
async function connectToDatabase() {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.DB_SECRET, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log(`[${new Date().toISOString()}] Connected to MongoDB`);
    }
    return mongoose.connection;
  }
// Function to check users who haven't logged in today and send notifications
async function checkInactiveUsersAndNotify() {
  console.log("hallo");
  try {
    let connection;
    // Connect to MongoDB if not already connected
    connection = await connectToDatabase();
    // Get today's start and end
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Find users who haven't logged in today
    const inactiveUsers = await User.find({
      $or: [{ lastLogin: { $lt: todayStart } }, { lastLogin: null }],
    });

    // Process each inactive user
    for (const user of inactiveUsers) {
      // Create notification
      const notification = new Notification({
        type: "USER_NOT_REGISTERED",
        message: `الغياب اليوم: الموظف ${user.username} (${user.brunch}) لم يسجل الحضور.`,
        status: false, // Note: You have a typo in your schema (fales -> false)
      });

      await notification.save();

      // Here you would add your push notification logic
      await sendPushNotification(user);
    }

    console.log(`Processed ${inactiveUsers.length} inactive users`);
  } catch (error) {
    console.error("Error checking inactive users:", error);
  }
}
// Placeholder for your push notification function
async function sendPushNotification(user) {
  try {
    // Implement your push notification logic here
    console.log(
      `Sending push notification to ${user.username} (${user.phone})`
    );
    // Example with Firebase:
    /*
        await admin.messaging().send({
            token: user.pushToken,
            notification: {
                title: 'غياب اليوم',
                body: `الموظف ${user.username} لم يسجل حضوره اليوم`
            }
        });
        */
  } catch (error) {
    console.error(
      `Failed to send push notification to ${user.username}:`,
      error
    );
  }
}

// دالة التحقق من كمية المنتجات
// دالة التحقق من كميات جميع المنتجات
async function checkLowQuantityProducts() {
    console.log(`[${new Date().toISOString()}] بدء التحقق من كميات جميع المنتجات...`);
    let connection;
    try {
      connection = await connectToDatabase();
  
      // Find products where any branch has quantity less than minQuantity
      const products = await Product.find({
        "branch.quantity": { $lt: 10 } // Use plain number since quantity is Number type
      });
  
      console.log(`[${new Date().toISOString()}] تم العثور على ${products.length} منتجات تحتوي على فروع بكمية منخفضة`);
  
      const notificationPromises = [];
  
      // Iterate over each product and its branches
      for (const product of products) {
        for (const branch of product.branch) {
          if (branch.quantity < product.minQuantity) { // Compare with product's minQuantity
            notificationPromises.push(
              (async () => {
                try {
                  const notification = new Notification({
                    type: "LOW_PRODUCT_QUANTITY",
                    message: `المنتج ${product.name} في فرع ${branch.branchName} أقل من الحد الأدنى (الكمية المتبقية: ${branch.quantity})`,
                    status: false,
                  });
  
                  await notification.save();
                  await sendPushNotification(product, branch.branchName, branch.quantity);
                  return { success: true, product: `${product.name} (${branch.branchName})` };
                } catch (error) {
                  console.error(`[${new Date().toISOString()}] خطأ في معالجة ${product.name} في ${branch.branchName}:`, error);
                  return { success: false, product: `${product.name} (${branch.branchName})`, error: error.message };
                }
              })()
            );
          }
        }
      }
  
      const results = await Promise.all(notificationPromises);
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);
  
      console.log(`[${new Date().toISOString()}] تمت معالجة ${results.length} فروع بكميات منخفضة`);
      console.log(`[${new Date().toISOString()}] تم الإشعار بنجاح لـ: ${successful}`);
      if (failed.length > 0) {
        console.log(`[${new Date().toISOString()}] فشل الإشعارات:`, failed);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] خطأ في checkLowQuantityProducts:`, error);
    } finally {
      if (connection && mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }
    }
  }

// Schedule this to run daily (using node-cron or similar)
import cron from "node-cron";

cron.schedule(
  "0 12 * * *",
  () => {
    console.log(
      `[${new Date().toISOString()}] Running daily inactive user check at 9:06 AM Cairo Time...`
    );
    checkInactiveUsersAndNotify();
    checkLowQuantityProducts();
  },
  {
    scheduled: true,
    timezone: "Africa/Cairo", // Set Cairo time zone
  }
);

export const addNoti = () => {};
