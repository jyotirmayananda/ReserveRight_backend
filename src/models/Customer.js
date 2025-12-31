import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  // No role field needed, as this collection is exclusively for customers
}, {
  timestamps: true,
});

// Remove password from JSON output
customerSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);

export default Customer;
