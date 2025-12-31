import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for guest bookings
    index: true,
  },
  // Guest booking fields (when userId is not provided)
  customerName: {
    type: String,
    required: function() { return !this.userId; },
  },
  customerEmail: {
    type: String,
    required: function() { return !this.userId; },
  },
  customerPhone: {
    type: String,
    required: function() { return !this.userId; },
  },
  tableId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
    required: true,
  },
  guestCount: {
    type: Number,
    required: true,
    min: 1,
  },
  reservationDate: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
    index: true,
  },
  timeSlot: {
    type: String,
    required: true,
    match: /^\d{2}:\d{2}$/,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
  },
  confirmedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Compound index to prevent overlapping reservations
reservationSchema.index({ tableId: 1, reservationDate: 1, timeSlot: 1 }, { unique: true });

const Reservation = mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema);

export default Reservation;

