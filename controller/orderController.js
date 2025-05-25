import mongoose from "mongoose";
import Order from "../models/orders.js";
import Product from "../models/product.js";
import Notification from "../models/notifications.js";

export const addOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      customer_name,
      customer_phone,
      seller_name,
      branch,
      order_code,
      type,
      total_price,
      order_details,
      payment,
      status
    } = req.body;

    console.log("Received order data:", req.body); // Debug log

    // Validate required fields
    if (!branch || !total_price || !order_details || order_details.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Branch, total_price, and order_details are required"
      });
    }

    // Validate branch
    const validBranches = ['miami', 'glanklis', 'seyouf'];
    if (!validBranches.includes(branch.toLowerCase())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid branch. Valid branches are: miami, glanklis, seyouf"
      });
    }

    // Check product availability and collect inventory updates
    const inventoryUpdates = [];
    const productDetails = [];

    console.log("Processing order details:", order_details); // Debug log

    for (const detail of order_details) {
      console.log("Processing detail:", detail); // Debug log
      
      if (detail.item_code && (detail.quantity > 0 || !detail.quantity)) {
        // Set default quantity if not provided
        const quantity = detail.quantity || 1;
        // Find the product
        const product = await Product.findOne({ code: detail.item_code }).session(session);
        
        console.log("Found product:", product); // Debug log
        
        if (!product) {
          await session.abortTransaction();
          return res.status(404).json({
            success: false,
            message: `Product with code ${detail.item_code} not found`
          });
        }

        // Check if enough quantity is available in the specified branch
        const branchKey = branch.toLowerCase();
        const availableQuantity = product.branches[branchKey];
        
        console.log(`Branch: ${branchKey}, Available: ${availableQuantity}, Requested: ${quantity}`); // Debug log
        
        if (availableQuantity < quantity) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient quantity for product ${detail.item_code} in ${branch} branch. Available: ${availableQuantity}, Requested: ${quantity}`
          });
        }

        // Prepare inventory update
        inventoryUpdates.push({
          productId: product._id,
          branchKey,
          quantityToReduce: quantity,
          currentBranchQty: availableQuantity,
          currentTotalQty: product.totalQuantity
        });

        // Store product details for response
        productDetails.push({
          item_code: detail.item_code,
          product_name: product.name,
          category: product.category,
          quantity_ordered: quantity,
          branch: branch,
          remaining_in_branch: availableQuantity - quantity
        });
      } else {
        console.log("Skipping detail - missing item_code:", detail); // Debug log
      }
    }

    console.log("Inventory updates to perform:", inventoryUpdates); // Debug log

    // Update inventory for all products
    for (const update of inventoryUpdates) {
      const newBranchQty = update.currentBranchQty - update.quantityToReduce;
      const newTotalQty = update.currentTotalQty - update.quantityToReduce;
      
      console.log(`Updating product ${update.productId}: ${update.branchKey} from ${update.currentBranchQty} to ${newBranchQty}`); // Debug log
      
      const updateResult = await Product.findByIdAndUpdate(
        update.productId,
        {
          $set: {
            [`branches.${update.branchKey}`]: newBranchQty,
            totalQuantity: newTotalQty
          }
        },
        { 
          session,
          new: true // Return the updated document
        }
      );
      
      console.log("Update result:", updateResult); // Debug log
      
      if (!updateResult) {
        await session.abortTransaction();
        return res.status(500).json({
          success: false,
          message: `Failed to update inventory for product ${update.productId}`
        });
      }
    }

    // Create the order
    const newOrder = new Order({
      customer_name,
      customer_phone,
      order_code,
      seller_name,
      branch,
      type,
      total_price,
      order_details,
      payment,
      status: status || 'lab'
    });

    console.log("Creating order:", newOrder); // Debug log

    const savedOrder = await newOrder.save({ session });

    console.log("Order saved successfully"); // Debug log

    // Commit the transaction
    await session.commitTransaction();
    console.log("Transaction committed"); // Debug log

    res.status(201).json({
      success: true,
      message: "Order created successfully and inventory updated",
      data: {
        order: savedOrder,
      }
    });

  } catch (error) {
    // Rollback the transaction in case of error
    await session.abortTransaction();
    console.error("Error creating order:", error);
    
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: "Order code already exists. Please try again."
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Server error while creating order",
        error: error.message
      });
    }
  } finally {
    session.endSession();
  }
}

export const getOrders = async (req, res) => {
  try {
    // Get branch from token and normalize
    let userBranch = req.user.branch;
    if (userBranch === "ميامي") {
      userBranch = "miami";
    }else if (userBranch === "جانكليس") {
          userBranch = "glanklis";
    }else if (userBranch === "السيوف") {
          userBranch = "seyouf";
    }

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Build query - always filter by user's branch from token
    let query = {
      date: {
        $gte: startOfDay,
        $lt: endOfDay
      },
      branch: new RegExp(userBranch, 'i')
    };

    // Get today's orders
    const todayOrders = await Order.find(query).sort({ date: -1 });

    // Calculate metrics
    const totalOrdersToday = todayOrders.length;

    const totalProfitToday = todayOrders.reduce((total, order) => {
      const orderPayments = order.payment?.reduce((paymentSum, payment) => {
        return paymentSum + (payment.PaymentDone || 0);
      }, 0) || 0;
      return total + orderPayments;
    }, 0);

    const totalRevenueToday = todayOrders.reduce((total, order) => {
      return total + (order.total_price || 0);
    }, 0);

    const pendingBalance = totalRevenueToday - totalProfitToday;

    // Group orders by status
    const ordersByStatus = todayOrders.reduce((acc, order) => {
      const status = order.status || 'unknown';
      if (!acc[status]) {
        acc[status] = { count: 0, total_value: 0 };
      }
      acc[status].count += 1;
      acc[status].total_value += order.total_price || 0;
      return acc;
    }, {});

    // Get seller stats
    const sellerStats = todayOrders.reduce((acc, order) => {
      const seller = order.seller_name || 'Unknown';
      if (!acc[seller]) {
        acc[seller] = { orders: 0, total_sales: 0, profit: 0 };
      }
      acc[seller].orders += 1;
      acc[seller].total_sales += order.total_price || 0;

      const sellerProfit = order.payment?.reduce((sum, payment) => {
        return sum + (payment.PaymentDone || 0);
      }, 0) || 0;
      acc[seller].profit += sellerProfit;

      return acc;
    }, {});

    // Add payment_status to each order
    const ordersWithPaymentStatus = todayOrders.map(order => {
      const orderPayments = order.payment?.reduce((sum, payment) => {
        return sum + (payment.PaymentDone || 0);
      }, 0) || 0;
      const orderPendingBalance = (order.total_price || 0) - orderPayments;
      return {
        ...order.toObject(),
        payment_status: orderPendingBalance > 0 ? 'not paid' : 'paid'
      };
    });

    res.status(200).json({
      success: true,
      date: today.toISOString().split('T')[0],
      branch: userBranch,
      summary: {
        total_orders: totalOrdersToday,
        total_revenue: totalRevenueToday,
        total_profit: totalProfitToday,
        pending_balance: pendingBalance,
        average_order_value: totalOrdersToday > 0 ? Math.round(totalRevenueToday / totalOrdersToday) : 0
      },
      orders: ordersWithPaymentStatus
    });

  } catch (error) {
    console.error("Error fetching today's analytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching today's analytics",
      error: error.message
    });
  }
};