import mongoose from "mongoose";
import Order from "../models/orders.js";
import Product from "../models/product.js";
import Notification from "../models/notifications.js";
import Expenses from "../models/expenses.js";
import Client from "../models/clients.js";

function generateOrderCode() {
  const randomNumber = Math.floor(100000000000 + Math.random() * 900000000000); // 12-digit number
  return `INV-${randomNumber}`;
}

export const addOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let {
      customer_name,
      customer_phone,
      total_price,
      order_details,
      payment,
      status,
      notes,
    } = req.body;

    const client = await Client.findOne({ phone: customer_phone });
    if (client) {
      customer_name = client.name;
      customer_phone = client.phone;
    } else {
      await Client.create({ name: customer_name, phone: customer_phone });
    }

    const order_code = generateOrderCode();
    const branch = req.user.branch;
    const seller_name = req.user.name;
    // Validate required fields
    if (
      !branch ||
      !total_price ||
      !order_details ||
      order_details.length === 0
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Branch, total_price, and order_details are required",
      });
    }

    // Validate branch
    const validBranches = ["miami", "glanklis", "seyouf"];
    if (!validBranches.includes(branch.toLowerCase())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid branch. Valid branches are: miami, glanklis, seyouf",
      });
    }

    // Check product availability and collect inventory updates
    const inventoryUpdates = [];
    const productDetails = [];
    for (const detail of order_details) {
      if (detail.item_code && (detail.quantity > 0 || !detail.quantity)) {
        // Set default quantity if not provided
        const quantity = detail.quantity || 1;
        // Find the product
        const product = await Product.findOne({
          code: detail.item_code,
        }).session(session);

        if (!product) {
          await session.abortTransaction();
          return res.status(404).json({
            success: false,
            message: `Product with code ${detail.item_code} not found`,
          });
        }

        // Check if enough quantity is available in the specified branch
        const branchKey = branch.toLowerCase();
        const availableQuantity = product.branches[branchKey];
        if (availableQuantity < quantity) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Insufficient quantity for product ${detail.item_code} in ${branch} branch. Available: ${availableQuantity}, Requested: ${quantity}`,
          });
        }

        // Prepare inventory update
        inventoryUpdates.push({
          productId: product._id,
          branchKey,
          quantityToReduce: quantity,
          currentBranchQty: availableQuantity,
          currentTotalQty: product.totalQuantity,
        });

        // Store product details for response
        productDetails.push({
          item_code: detail.item_code,
          product_name: product.name,
          category: product.category,
          quantity_ordered: quantity,
          branch: branch,
          remaining_in_branch: availableQuantity - quantity,
        });
      } else {
        console.log("Skipping detail - missing item_code:", detail); // Debug log
      }
    }
    // Update inventory for all products
    for (const update of inventoryUpdates) {
      const newBranchQty = update.currentBranchQty - update.quantityToReduce;
      const newTotalQty = update.currentTotalQty - update.quantityToReduce;
      const updateResult = await Product.findByIdAndUpdate(
        update.productId,
        {
          $set: {
            [`branches.${update.branchKey}`]: newBranchQty,
            totalQuantity: newTotalQty,
          },
        },
        {
          session,
          new: true, // Return the updated document
        }
      );
      if (!updateResult) {
        await session.abortTransaction();
        return res.status(500).json({
          success: false,
          message: `Failed to update inventory for product ${update.productId}`,
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
      total_price,
      order_details,
      payment,
      notes,
      status: status || "lab",
    });

    const savedOrder = await newOrder.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    res.status(201).json({
      success: true,
      order_code: order_code,
      message: "Order created successfully and inventory updated",
    });
  } catch (error) {
    // Rollback the transaction in case of error
    await session.abortTransaction();
    console.error("Error creating order:", error);

    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: "Order code already exists. Please try again.",
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Server error while creating order",
        error: error.message,
      });
    }
  } finally {
    session.endSession();
  }
};

export const getOrders = async (req, res) => {
  try {
    // Normalize user branch from token
    let userBranch = req.user.branch;
    if (userBranch === "ميامي") {
      userBranch = "miami";
    } else if (userBranch === "جانكليس") {
      userBranch = "glanklis";
    } else if (userBranch === "السيوف") {
      userBranch = "seyouf";
    }

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Query for today's active orders (excluding refunds and cancellations)
    const query = {
      date: { $gte: startOfDay, $lt: endOfDay },
      branch: new RegExp(userBranch, "i"),
      status: { $nin: ["cancelled", "refund"] },
    };

    // Fetch today's orders
    const todayOrders = await Order.find(query)
      .sort({ date: -1 })
      .select(
        "-__v -branch -seller_name  -_id -order_details -customer_phone -payment -notes"
      );

    // Calculate number of refund orders separately
    const refundOrdersCount = await Order.countDocuments({
      date: { $gte: startOfDay, $lt: endOfDay },
      branch: new RegExp(userBranch, "i"),
      status: "refund",
    });

    // Total number of orders
    const totalOrdersToday = todayOrders.length;

    // Sum of payments for today’s orders
    const totalProfitToday = todayOrders.reduce((total, order) => {
      const orderPayments = order.payment?.reduce((sum, p) => sum + (p.PaymentDone || 0), 0) || 0;
      return total + orderPayments;
    }, 0);

    // Add payment status per order
    const ordersWithPaymentStatus = todayOrders.map((order) => {
      const orderPayments = order.payment?.reduce((sum, p) => sum + (p.PaymentDone || 0), 0) || 0;
      const pending = (order.total_price || 0) - orderPayments;
      return {
        ...order.toObject(),
        payment_status: pending > 0 ? "not paid" : "paid",
      };
    });

    res.status(200).json({
      success: true,
      date: today.toISOString().split("T")[0],
      branch: userBranch,
      summary: {
        total_orders: totalOrdersToday,
        total_profit: totalProfitToday,
        refund_orders: refundOrdersCount,
      },
      orders: ordersWithPaymentStatus,
    });
  } catch (error) {
    console.error("Error fetching today's analytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching today's analytics",
      error: error.message,
    });
  }
};
export const getOrderByCode = async (req, res) => {
  const { code } = req.params;

  if (!code) {
    return res.status(400).json("The code is required");
  }

  try {
    const order = await Order.findOne({ order_code: code }).select(
      "-__v -payment._id -order_details._id -order_details.quantity -order_details.notes -branch -seller_name -status -_id -order_details.lenticular_left_cost -order_details.lenticular_right_cost"
    );

    if (!order) {
      return res.status(404).json("No order found with this code");
    }

    // Fetch product details for each item_code in order_details
    const detailedOrderItems = await Promise.all(
      order.order_details.map(async (item) => {
        const product = await Product.findOne({ code: item.item_code }).select(
          "-__v -branches -_id -totalQuantity"
        );
        return {
          ...item.toObject(),
          product: product || null,
        };
      })
    );

    // Calculate total payments done
    const totalPaid = order.payment.reduce(
      (sum, p) => sum + (p.PaymentDone || 0),
      0
    );
    const pendingAmount = order.total_price - totalPaid;

    // Determine payment status
    const payment_status = pendingAmount > 0 ? "not completed" : "completed";

    // Add pending amount to each payment record
    const paymentWithPending = order.payment.map((p) => ({
      ...p.toObject(),
      pending: pendingAmount,
    }));

    const fullOrder = {
      ...order.toObject(),
      order_details: detailedOrderItems,
      payment: paymentWithPending,
      payment_status, // <- here
    };

    return res.status(200).json(fullOrder);
  } catch (error) {
    console.error(error);
    return res.status(500).json("Internal server error");
  }
};

export const addPaymentToOrder = async (req, res) => {
  const { code } = req.params;
  const {
    PaymentDone,
    payment_method,
    bank,
    method,
    code: paymentCode,
    discount,
  } = req.body;

  if (!PaymentDone || PaymentDone <= 0) {
    return res.status(400).json("Payment amount must be greater than 0");
  }

  try {
    const order = await Order.findOne({ order_code: code });

    if (!order) {
      return res.status(404).json("Order not found");
    }

    // Create payment object
    const newPayment = {
      PaymentDone,
      payment_method,
      bank,
      method,
      code: paymentCode,
      discount,
    };

    order.payment.push(newPayment);
    await order.save();

    return res.status(200).json({
      message: "Payment added successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json("Internal server error");
  }
};

export const refundOrder = async (req, res) => {
  const { code } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim() === "") {
    return res.status(400).json("Refund reason is required");
  }

  try {
    const order = await Order.findOne({ order_code: code });

    if (!order) {
      return res.status(404).json("Order not found");
    }

    order.status = "refund";
    order.reason = reason;

    await order.save();

    return res.status(200).json({
      message: "Order marked as refunded",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json("Internal server error");
  }
};

export const cancelOrder = async (req, res) => {
  const { code } = req.params;

  try {
    const order = await Order.findOne({ order_code: code });

    if (!order) {
      return res.status(404).json("Order not found");
    }

    order.status = "cancelled"; // or "refunded" or any status you define
    await order.save();

    return res.status(200).json({
      message: "Order marked as cancelled",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json("Internal server error");
  }
};

export const labOrders = async (req, res) => {
  try {
    // Restrict access if not lab
    if (req.user.type === "user") {
      return res
        .status(403)
        .json("Cannot get lab orders. Your role is not authorized.");
    }

    // Get start and end of today
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    // Get lab orders
    const labOrders = await Order.find({
      date: { $gte: startOfDay, $lt: endOfDay },
     status: { $in: ["lab", "In progress"] },
    })
      .sort({ date: -1 })
      .select(
        "-__v -branch -seller_name  -_id -order_details -customer_phone -payment -notes"
      );

    // Add payment_status to each order
    const ordersWithPaymentStatus = labOrders.map((order) => {
      const totalPaid =
        order.payment?.reduce((sum, p) => sum + (p.PaymentDone || 0), 0) || 0;
      const pendingAmount = order.total_price - totalPaid;
      const payment_status = pendingAmount > 0 ? "not completed" : "completed";

      return {
        ...order.toObject(),
        payment_status,
      };
    });

    res.status(200).json({
      success: true,
      total: ordersWithPaymentStatus.length,
      orders: ordersWithPaymentStatus,
    });
  } catch (error) {
    console.error("Error fetching lab orders:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching lab orders",
      error: error.message,
    });
  }
};

export const orderReady = async (req, res) => {
  const { code } = req.params;
  const { labNotes } = req.body;

  if (!code) {
    return res.status(400).json("Order code is required");
  }

  try {
    // Find order by order_code
    const order = await Order.findOne({ order_code: code });

    if (!order) {
      return res.status(404).json("Order not found");
    }

    // Prevent update if status is canceled or refund
    if (order.status === "canceled" || order.status === "refund") {
      return res
        .status(400)
        .json(`Cannot mark order as ready because it is ${order.status}`);
    }

    if (order.status === "ready") {
      return res
        .status(400)
        .json(`Cannot mark order as ready because it is ready`);
    }
    // Update status to 'ready' and labNotes
    order.status = "ready";
    order.labNotes = labNotes || " ";

    await order.save();

    res.status(200).json({
      success: true,
      message: `Order ${code} marked as ready`,
      order,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating order status",
      error: error.message,
    });
  }
};

export const updateOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { order_code } = req.params;
    let {
      customer_name,
      customer_phone,
      total_price,
      notes,
      order_details,
      payment,
    } = req.body;

    if (!order_details || !Array.isArray(order_details)) {
      return res.status(400).json({
        success: false,
        message: "order_details must be an array",
      });
    }

    const existingOrder = await Order.findOne({ order_code }).session(session);
    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const branch = existingOrder.branch;
    const oldOrderDetails = existingOrder.order_details;

    const countItemsByCode = (details) =>
      details.reduce((acc, detail) => {
        const code = detail.item_code;
        acc[code] = (acc[code] || 0) + (detail.quantity || 1);
        return acc;
      }, {});

    const oldItemCounts = countItemsByCode(oldOrderDetails);
    const newItemCounts = countItemsByCode(order_details);

    const removedItems = [];
    const addedItems = [];

    for (const code in oldItemCounts) {
      const oldQty = oldItemCounts[code] || 0;
      const newQty = newItemCounts[code] || 0;
      if (oldQty > newQty) {
        removedItems.push({ item_code: code, quantity: oldQty - newQty });
      }
    }

    for (const code in newItemCounts) {
      const oldQty = oldItemCounts[code] || 0;
      const newQty = newItemCounts[code] || 0;
      if (newQty > oldQty) {
        addedItems.push({ item_code: code, quantity: newQty - oldQty });
      }
    }

    const changeLog = { modifiedFields: [], replacedProducts: [] };
    let priceAdjustment = 0;

    // Restore inventory from removed items
    for (const { item_code, quantity } of removedItems) {
      const product = await Product.findOne({ code: item_code }).session(session);
      if (!product) throw new Error(`Product ${item_code} not found`);

      const currentQty = product[branch] || 0;
      const totalQty = product.quantity || 0;

      await Product.findByIdAndUpdate(
        product._id,
        {
          $set: {
            [branch]: currentQty + quantity,
            quantity: totalQty + quantity,
          },
        },
        { session }
      );

      const oldDetail = oldOrderDetails.find((d) => d.item_code === item_code);
      const itemPrice = oldDetail?.glassPrice || 0;
      priceAdjustment -= itemPrice * quantity;

      changeLog.modifiedFields.push(`removed item ${item_code} (quantity: ${quantity})`);
    }

    // Deduct inventory for added items
    for (const { item_code, quantity } of addedItems) {
      const product = await Product.findOne({ code: item_code }).session(session);
      if (!product) throw new Error(`Product ${item_code} not found`);

      const available = product[branch] || 0;
      if (available < quantity) throw new Error(`Insufficient quantity for ${item_code}`);

      await Product.findByIdAndUpdate(
        product._id,
        {
          $set: {
            [branch]: available - quantity,
            quantity: product.quantity - quantity,
          },
        },
        { session }
      );

      const newDetail = order_details.find((d) => d.item_code === item_code);
      const itemPrice = newDetail?.glassPrice || 0;
      priceAdjustment += itemPrice * quantity;
    }

    // Default missing glassPrice to 0
    order_details = order_details.map((d) => ({
      ...d,
      glassPrice: d.glassPrice || 0,
    }));

    const updatedOrder = await Order.findOneAndUpdate(
      { order_code },
      {
        customer_name,
        customer_phone,
        total_price: total_price ?? existingOrder.total_price + priceAdjustment,
        notes,
        order_details,
        payment,
      },
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Order updated successfully",
      change_log: changeLog,
      updated_order: updatedOrder,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error while updating order",
      error: error.message,
    });
  }
};


export const getCliant = async (req, res) => {
  try {
    const { search } = req.query;

    if (!search) {
      return res.status(400).json({
        message: "Please provide a search term (name, phone, or code).",
      });
    }

    const isNumber = !isNaN(search);

    // Build the client search query
    const clientQuery = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ],
    };

    if (isNumber) {
      clientQuery.$or.push({ code: Number(search) });
    }

    const client = await Client.findOne(clientQuery).lean();

    if (!client) {
      return res.status(404).json({
        message: "No client found with the provided search term.",
      });
    }

    // Order search filter for this client
    const orderFilter = {
      customer_phone: client.phone,
      status: { $nin: ["cancelled", "refund"] },
    };

    // Fetch all valid orders
    const allOrders = await Order.find(orderFilter).lean();

    if (allOrders.length === 0) {
      return res.status(404).json({
        message: "No valid orders found for this client.",
      });
    }

    // Get the latest order
    const lastOrder = allOrders.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    )[0];

    // Calculate total pending amount
    const totalPendingAmount = allOrders.reduce((sum, order) => {
      const paid = order.payment.reduce(
        (acc, p) => acc + (p?.PaymentDone || 0),
        0
      );
      return sum + (order.total_price - paid);
    }, 0);

    const lastOrderPaid = lastOrder.payment.reduce(
      (acc, p) => acc + (p?.PaymentDone || 0),
      0
    );

    const isFullyPaid = lastOrderPaid >= lastOrder.total_price;

    // Final response
    const response = {
      customer_name: client.name,
      customer_phone: client.phone,
      customer_code: client.code,
      total_pending_amount: totalPendingAmount,
      last_order: {
        customer_name : lastOrder.customer_name,
        order_code: lastOrder.order_code,
        total_price: lastOrder.total_price,
        status: lastOrder.status,
        date: lastOrder.date,
         payment_status: isFullyPaid ? "paid" : "not paid",
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching client/order:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const getReports = async (req, res) => {
  try {
    const { branch, date } = req.query;

    // Build query
    const query = {};

    if (branch) {
      query.branch = branch;
    }

    if (date) {
      const startDate = new Date(date);
      if (isNaN(startDate.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);

      query.date = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Fetch orders without 'payment' field
    const orders = await Order.find(query)
      .select("customer_name order_code date total_price status payment") // Include 'payment' temporarily
      .lean();

    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found for the specified criteria." });
    }

    // Calculate pending and remove 'payment' field
    const ordersWithPending = orders.map((order) => {
      const paymentDone = order.payment?.reduce(
        (acc, curr) => acc + (curr?.PaymentDone || 0),
        0
      ) || 0;

      const pendingAmount = order.total_price - paymentDone;
      const isFullyPaid = order.total_price <= paymentDone;

      const { payment ,_id , ...orderWithoutPayment } = order;

      return {
        ...orderWithoutPayment,
        payment_status: isFullyPaid ? "paid" : "not paid",
      };
    });

    const totalPendingAmount = ordersWithPending.reduce(
      (sum, order) => sum + order.pending_amount,
      0
    );

    const response = {
      total_orders: ordersWithPending.length,
      orders: ordersWithPending,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching reports:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const addExpenses = async (req, res) => {
  try {
    // Assuming req.user is populated by authentication middleware
    const { LicenseNumber, date, type, price, notes } = req.body;

    const expense = new Expenses({
      LicenseNumber,
      date,
      type,
      price,
      user: req.user._id, // Use _id from authenticated user, not name
      branch: req.user.branch,
      notes,
    });

    await expense.save();
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getExpencess = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build dynamic date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        dateFilter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.date.$lte = new Date(endDate);
      }
    }

    // Fetch filtered expenses
    const expenses = await Expenses.find(dateFilter).select(
      "-__v -_id -createdAt"
    );

    // Aggregate by type with filtered data
    const typeDistribution = await Expenses.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$price" },
        },
      },
      {
        $project: {
          type: "$_id",
          totalAmount: 1,
          _id: 0,
        },
      },
    ]);

    // Calculate total sum
    const total = typeDistribution.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );

    // Add percentage to each type
    const typeDistributionWithPercentage = typeDistribution.map((item) => ({
      ...item,
      percentage:
        total > 0 ? ((item.totalAmount / total) * 100).toFixed(2) : "0.00",
    }));

    res.status(200).json({
      typeDistribution: typeDistributionWithPercentage,
      totalAmount: total,
      expenses,
    });
  } catch (error) {
    console.error("Error in summary endpoint:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const reportPayment = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchConditions = {
      status: { $nin: ["canceled", "refund"] },
    };

    if (startDate || endDate) {
      matchConditions.date = {};
      if (startDate) {
        matchConditions.date.$gte = new Date(startDate);
      }
      if (endDate) {
        matchConditions.date.$lte = new Date(endDate);
      }
    }

    // 1. Payment distribution by method
    const paymentDistribution = await Order.aggregate([
      { $match: matchConditions },
      { $unwind: "$payment" },
      {
        $group: {
          _id: "$payment.payment_method",
          totalPaid: { $sum: "$payment.PaymentDone" },
        },
      },
      {
        $project: {
          payment_method: "$_id",
          totalPaid: 1,
          _id: 0,
        },
      },
    ]);

    // Calculate total revenue for percentages
    const totalRevenue = paymentDistribution.reduce(
      (sum, item) => sum + item.totalPaid,
      0
    );

    const paymentDistributionWithPercentages = paymentDistribution.map(
      (item) => ({
        ...item,
        percentage:
          totalRevenue > 0
            ? ((item.totalPaid / totalRevenue) * 100).toFixed(2)
            : "0.00",
      })
    );

    // 2. Revenue by day of week
    const weeklyRevenue = await Order.aggregate([
      { $match: matchConditions },
      { $unwind: "$payment" },
      {
        $group: {
          _id: { $dayOfWeek: "$date" },
          totalPaid: { $sum: "$payment.PaymentDone" },
        },
      },
      {
        $project: {
          dayOfWeekNumber: "$_id",
          totalPaid: 1,
          _id: 0,
        },
      },
      {
        $addFields: {
          dayName: {
            $arrayElemAt: [
              [
                "",
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ],
              "$dayOfWeekNumber",
            ],
          },
        },
      },
      {
        $project: {
          dayName: 1,
          totalPaid: 1,
        },
      },
      { $sort: { dayOfWeekNumber: 1 } },
    ]);

    res.status(200).json({
      totalRevenue,
      paymentDistribution: paymentDistributionWithPercentages,
      weeklyRevenue,
    });
  } catch (error) {
    console.error("Error generating payment summary:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const getClients = async (req, res) => {
  try {
    const { search } = req.query;

    if (!search) {
      return res.status(400).json({ error: "Search query is required." });
    }

    const isNumber = !isNaN(search);

    const filter = {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ],
    };

    // If search is a number, add code to the OR filter
    if (isNumber) {
      filter.$or.push({ code: Number(search) });
    }

    const clients = await Client.find(filter);

    if (clients.length === 0) {
      return res.status(404).json({ message: "No matching clients found." });
    }

    res.status(200).json(clients);
  } catch (error) {
    console.error("Error during client search:", error);
    res.status(500).json({ error: "Server error during client search." });
  }
};

export const getRefundOrdersToday = async (req, res) => {
  try {
    // Define the start and end of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Filter for orders with status 'refund' created today
    const filter = {
      status: "refund",
      date: { $gte: startOfDay, $lte: endOfDay },
    };

    const refundedOrders = await Order.find(filter)
      .sort({ date: -1 })
      .lean()
      .select("-__v -order_details -seller_name -notes ");

    res.status(200).json({
      message: "refunded orders",
      orders: refundedOrders,
    });
  } catch (error) {
    console.error("Error fetching today's refunded orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
const { code } = req.params;

// Validate presence of order code
    if (!code) {
      return res.status(400).json({ message: "Invalid order code." });
    }
    
    // Update the order status using the unique order_code field
    const updatedOrder = await Order.findOneAndUpdate(
      { order_code: code },
      { status: "In progress" },
      { new: true }
    );
    
    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.status(200).json({
      message: 'Order status updated to "In progress".',
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
