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
    // Get branch from token and normalize
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

    // Build query - always filter by user's branch from token
    let query = {
      date: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
      branch: new RegExp(userBranch, "i"),
      status: { $nin: ["cancelled", "refund"] },
    };

    const todayOrders = await Order.find(query)
      .sort({ date: -1 })
      .select(
        "-__v -branch -seller_name -status -_id -order_details -customer_phone"
      );
    // Calculate metrics
    const totalOrdersToday = todayOrders.length;

    const totalProfitToday = todayOrders.reduce((total, order) => {
      const orderPayments =
        order.payment?.reduce((paymentSum, payment) => {
          return paymentSum + (payment.PaymentDone || 0);
        }, 0) || 0;
      return total + orderPayments;
    }, 0);

    const totalRevenueToday = todayOrders.reduce((total, order) => {
      return total + (order.total_price || 0);
    }, 0);

    const pendingBalance = totalRevenueToday - totalProfitToday;

    // Count refund orders
    const refundOrdersCount = todayOrders.filter(
      (order) => order.status?.toLowerCase() === "refund"
    ).length;

    // Group orders by status
    const ordersByStatus = todayOrders.reduce((acc, order) => {
      const status = order.status || "unknown";
      if (!acc[status]) {
        acc[status] = { count: 0, total_value: 0 };
      }
      acc[status].count += 1;
      acc[status].total_value += order.total_price || 0;
      return acc;
    }, {});

    // Get seller stats
    const sellerStats = todayOrders.reduce((acc, order) => {
      const seller = order.seller_name || "Unknown";
      if (!acc[seller]) {
        acc[seller] = { orders: 0, total_sales: 0, profit: 0 };
      }
      acc[seller].orders += 1;
      acc[seller].total_sales += order.total_price || 0;

      const sellerProfit =
        order.payment?.reduce((sum, payment) => {
          return sum + (payment.PaymentDone || 0);
        }, 0) || 0;
      acc[seller].profit += sellerProfit;

      return acc;
    }, {});
// Only include orders with non-empty payment array in the response
const ordersWithPayment = todayOrders.filter(
  (order) => Array.isArray(order.payment) && order.payment.length > 0
);

// Filter orders that have payments
const ordersWithPaymentStatus = todayOrders
  .filter(order => Array.isArray(order.payment) && order.payment.length > 0)
  .map(order => {
    const orderPayments = order.payment.reduce((sum, payment) => {
      return sum + (payment.PaymentDone || 0);
    }, 0);
    const orderPendingBalance = (order.total_price || 0) - orderPayments;

    const orderObj = order.toObject();
    delete orderObj.payment; // Remove payment from response

    return {
      ...orderObj,
      payment_status: orderPendingBalance > 0 ? "not paid" : "paid",
    };
  });
    res.status(200).json({
      success: true,
      date: today.toISOString().split("T")[0],
      branch: userBranch,
      summary: {
        total_orders: totalOrdersToday,
        // total_revenue: totalRevenueToday,
        total_profit: totalProfitToday,
        // pending_balance: pendingBalance,
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
  const { payment } = req.body;

  if (!payment || !payment.PaymentDone || payment.PaymentDone <= 0) {
    return res.status(400).json("Payment amount must be greater than 0");
  }

  try {
    const order = await Order.findOne({ order_code: code });

    if (!order) {
      return res.status(404).json("Order not found");
    }

    // Add new payment correctly (flat structure, not nested)
    order.payment.push(payment);

    await order.save();

    return res.status(200).json({
      message: "Payment added successfully",
      updated_payment: order.payment,
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
      updated_order: order,
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
      updated_order: order,
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
      status: "lab",
    })
      .sort({ date: -1 })
      .select(
        "-__v -branch -seller_name -status -_id -order_details -customer_phone -payment"
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
  const { code } = req.params;
  const updateData = req.body;

  if (!code) {
    return res.status(400).json("Order code is required");
  }

  try {
    const order = await Order.findOne({ order_code: code });

    if (!order) {
      return res.status(404).json("Order not found");
    }

    // Prevent updating immutable fields
    delete updateData._id;
    delete updateData.order_code;
    delete updateData.__v;

    // Update top-level fields and arrays like order_details and payment if provided
    Object.keys(updateData).forEach((key) => {
      order[key] = updateData[key];
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: `Order ${code} updated successfully`,
      order,
    });
  } catch (error) {
    console.error("Error updating order:", error);
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
    const lastOrder = allOrders.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

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
      is_paid: isFullyPaid ? "paid" : "not paid",
      last_order: {
        order_code: lastOrder.order_code,
        seller_name: lastOrder.seller_name,
        branch: lastOrder.branch,
        total_price: lastOrder.total_price,
        status: lastOrder.status,
        date: lastOrder.date,
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
    const { branch, date } = req.query; // Get query parameters

    // Build the query object
    const query = {
      status: { $nin: ["refund", "cancelled"] }, // Exclude orders with status 'refund' or 'cancelled'
    };

    // Filter by branch if provided
    if (branch) {
      query.branch = branch;
    }

    // Filter by date if provided (assuming date is in YYYY-MM-DD format)
    if (date) {
      const startDate = new Date(date);
      // Validate date format
      if (isNaN(startDate.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1); // End of the day
      query.date = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Fetch all orders matching the query
    const orders = await Order.find(query)
      .select(
        "customer_name customer_phone order_code seller_name branch type date total_price order_details payment status reason labNotes"
      )
      .lean(); // Convert to plain JavaScript objects for performance

    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found for the specified criteria." });
    }

    // Calculate total pending amount for each order
    const ordersWithPending = orders.map((order) => {
      const paymentDone = order.payment.reduce(
        (acc, curr) => acc + (curr?.PaymentDone || 0),
        0
      );
      const pendingAmount = order.total_price - paymentDone;
      const o = order.total_price <= paymentDone;
      return {
        ...order,
        pending_amount: pendingAmount >= 0 ? pendingAmount : 0, // Ensure no negative pending amounts
        is_paid: o === true ? "paid" : "not paid", // Indicate if the order is fully paid
      };
    });

    // Calculate total pending amount across all orders
    const totalPendingAmount = ordersWithPending.reduce(
      (sum, order) => sum + order.pending_amount,
      0
    );

    // Prepare the response
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

    const refundedOrders = await Order.find(filter).sort({ date: -1 }).lean().select("-__v");

    res.status(200).json({
      message: "refunded orders",
      orders: refundedOrders,
    });
  } catch (error) {
    console.error("Error fetching today's refunded orders:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
