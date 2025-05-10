import mongoose from 'mongoose';
import Order from '../models/orders.js';
import Product from '../models/product.js';
import Notification from '../models/notifications.js';

export const addOrder = async (req, res) => {
  const { customer_name, customer_phone, date, total_price, seller_name, branch, order_details, payment, order_code } = req.body;

  try {
    // Validate required fields
    if (!customer_name || !total_price || !order_details || !order_details.length || !branch) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customer_name, total_price, order_details, and branch are required',
      });
    }

    // Start a Mongoose transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Step 1: Validate product codes and update quantities
      const productUpdates = [];
      const notifications = [];

      // Fetch all products in one query to reduce database round-trips
      const itemCodes = order_details.map(detail => detail.item_code);
      const products = await Product.find({ code: { $in: itemCodes } })
        .session(session)
        .lean(); // Use lean for faster reads

      const productMap = new Map(products.map(p => [p.code, p]));

      for (const detail of order_details) {
        const { item_code, quantity = 1 } = detail;

        if (!item_code || quantity < 1) {
          throw new Error(`Invalid item_code or quantity in order_details`);
        }

        const product = productMap.get(item_code);
        if (!product) {
          throw new Error(`Product with code ${item_code} not found`);
        }

        // Find the branch in the product's branch array
        const branchData = product.branch.find(b => b.branchName === branch);
        if (!branchData) {
          throw new Error(`Branch ${branch} not found for product ${item_code}`);
        }

        // Check if sufficient quantity is available
        if (branchData.quantity < quantity) {
          throw new Error(
            `Insufficient quantity for product ${item_code} in branch ${branch}. Available: ${branchData.quantity}, Requested: ${quantity}`
          );
        }

        // Update branch quantity
        branchData.quantity -= quantity;

        // Calculate new totalQuantity
        const newTotalQuantity = product.branch.reduce((sum, b) => sum + b.quantity, 0);

        // Prepare product update
        productUpdates.push({
          updateOne: {
            filter: { _id: product._id },
            update: {
              $set: {
                branch: product.branch,
                totalQuantity: newTotalQuantity,
              },
            },
          },
        });

        // Check for low stock and prepare notification
        if (branchData.quantity <= product.minQuantity) {
          notifications.push({
            type: 'LOW_PRODUCT_QUANTITY',
            message: `المنتج ${product.name} في فرع ${branch} أقل من الحد الأدنى (الكمية المتبقية: ${branchData.quantity})`,
            status: false,
            createdAt: new Date(),
          });
        }
      }

      // Step 2: Bulk update products
      if (productUpdates.length > 0) {
        await Product.bulkWrite(productUpdates, { session });
      }

      // Step 3: Create notifications for low stock
      if (notifications.length > 0) {
        await Notification.insertMany(notifications, { session });
      }

      // Step 4: Create the new order
      const orderData = {
        customer_name,
        customer_phone,
        total_price,
        order_details,
        payment: payment || [],
        branch,
        type: 'In progress',
        order_code: order_code || `ORD-${Date.now()}`,
        seller_name: seller_name || '',
        date: date ? new Date(date) : new Date(),
      };

      const newOrder = new Order(orderData);
      const savedOrder = await newOrder.save({ session });

      // Step 5: Commit the transaction
      await session.commitTransaction();

      // Respond with the created order
      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: savedOrder,
      });
    } catch (error) {
      // Abort the transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      // End the session
      session.endSession();
    }
  } catch (error) {
    // Handle validation or database errors
    res.status(400).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  }
};