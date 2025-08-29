import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['USER_NOT_REGISTERED', 'LOW_PRODUCT_QUANTITY', 'LATE_RECEIPT'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  status: {
    type: Boolean,
    default:false
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Notification = mongoose.model('Notification', NotificationSchema);

export default Notification;