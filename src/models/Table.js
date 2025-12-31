import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  capacity: {
    type: Number,
    required: true,
    min: 1,
  },
}, {
  timestamps: true,
});

const Table = mongoose.models.Table || mongoose.model('Table', tableSchema);

export default Table;

