import mongoose from "mongoose";
import _sequence from 'mongoose-sequence';

const AutoIncrement = _sequence(mongoose);

const clientSchema = mongoose.Schema({
  name: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: "MAZAYA",
  },
  code: {
    type: Number,
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

clientSchema.plugin(AutoIncrement, { inc_field: "code" });

const Client =
  mongoose.models.Client || mongoose.model("Client", clientSchema);

export default Client;
