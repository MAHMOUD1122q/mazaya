import mongoose from 'mongoose';

// Define the Refund Schema
const refundSchema = new mongoose.Schema({
  refund_number: {
    type: String,
    required: true, // Refund number is required
    unique: true, // Ensure each refund has a unique identifier
    trim: true, // Remove unnecessary spaces
  },
  price: {
    type: Number,
    required: true, // Refund amount is required
    min: 0, // Price should be positive or zero
  },
  customer_name: {
    type: String,
    required: true, // Customer name is required
    trim: true, // Remove unnecessary spaces
  },
  payment_method: {
    type: String,
    required: true, // Payment method is required
    enum: ['Credit Card', 'PayPal', 'Cash', 'Bank Transfer'], // Possible payment methods
  },
  date: {
    type: Date,
    default: Date.now, // Automatically set the current date if not provided
    required: true, // Refund date is required
  },
  refund_details: [{
    item_name: {
      type: String,
      required: true, // Item name in the refund is required
    },
    reason: {
      type: String,
      required: true, // Reason for the refund is required
    },
    amount: {
      type: Number,
      required: true, // Amount refunded for each item is required
      min: 0, // Refund amount should be positive or zero
    },
  }],
});

// Create the Refund model from the schema
const Refund = mongoose.model('Refund', refundSchema);

export default Refund;