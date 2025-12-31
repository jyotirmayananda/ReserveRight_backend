import express from 'express';
import { z } from 'zod';
import Order from '../models/Order.js';
import Reservation from '../models/Reservation.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

const createOrderSchema = z.object({
  reservationId: z.string().min(1, 'Reservation ID is required'),
  items: z.array(z.object({
    name: z.string().min(1, 'Item name is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    price: z.number().min(0, 'Price must be positive'),
  })).min(1, 'At least one item is required'),
  notes: z.string().optional(),
});

const updateOrderSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled']).optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().min(1),
    price: z.number().min(0),
  })).optional(),
  notes: z.string().optional(),
});

// Get all orders (admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate({
        path: 'reservationId',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'tableId', select: 'name' },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = orders.map((order) => ({
      id: order._id.toString(),
      reservationId: order.reservationId._id.toString(),
      items: order.items,
      totalAmount: order.totalAmount,
      status: order.status,
      notes: order.notes,
      createdAt: order.createdAt,
      reservation: {
        id: order.reservationId._id.toString(),
        guestCount: order.reservationId.guestCount,
        reservationDate: order.reservationId.reservationDate,
        timeSlot: order.reservationId.timeSlot,
        tableName: order.reservationId.tableId?.name || 'N/A',
        customerName: order.reservationId.userId?.name || order.reservationId.customerName || 'Guest',
        customerEmail: order.reservationId.userId?.email || order.reservationId.customerEmail || 'N/A',
      },
    }));

    res.json({ orders: formatted });
  } catch (error) {
    next(error);
  }
});

// Get order by reservation ID
router.get('/reservation/:reservationId', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const order = await Order.findOne({ reservationId: new mongoose.Types.ObjectId(reservationId) })
      .populate({
        path: 'reservationId',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'tableId', select: 'name' },
        ],
      })
      .lean();

    if (!order) {
      return res.status(404).json({ error: 'Order not found for this reservation' });
    }

    res.json({ order });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Order not found' });
    }
    next(error);
  }
});

// Create order for a reservation (admin only)
router.post('/', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const validatedData = createOrderSchema.parse(req.body);
    const { reservationId, items, notes } = validatedData;

    // Check if reservation exists
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    // Check if order already exists
    const existingOrder = await Order.findOne({ reservationId: new mongoose.Types.ObjectId(reservationId) });
    if (existingOrder) {
      return res.status(409).json({ error: 'Order already exists for this reservation' });
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create order
    const newOrder = await Order.create({
      reservationId: new mongoose.Types.ObjectId(reservationId),
      items,
      totalAmount,
      notes: notes || '',
      status: 'pending',
    });

    // Confirm the reservation
    await Reservation.findByIdAndUpdate(reservationId, {
      status: 'confirmed',
      confirmedAt: new Date(),
    });

    const populated = await Order.findById(newOrder._id)
      .populate({
        path: 'reservationId',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'tableId', select: 'name' },
        ],
      })
      .lean();

    res.status(201).json({
      order: {
        id: populated._id.toString(),
        reservationId: populated.reservationId._id.toString(),
        items: populated.items,
        totalAmount: populated.totalAmount,
        status: populated.status,
        notes: populated.notes,
      },
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Order already exists for this reservation' });
    }
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    next(error);
  }
});

// Update order (admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = updateOrderSchema.parse(req.body);

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updates = {};
    if (validatedData.status) updates.status = validatedData.status;
    if (validatedData.items) {
      updates.items = validatedData.items;
      // Recalculate total
      updates.totalAmount = validatedData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }
    if (validatedData.notes !== undefined) updates.notes = validatedData.notes;

    const updatedOrder = await Order.findByIdAndUpdate(id, updates, { new: true })
      .populate({
        path: 'reservationId',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'tableId', select: 'name' },
        ],
      })
      .lean();

    res.json({
      order: {
        id: updatedOrder._id.toString(),
        reservationId: updatedOrder.reservationId._id.toString(),
        items: updatedOrder.items,
        totalAmount: updatedOrder.totalAmount,
        status: updatedOrder.status,
        notes: updatedOrder.notes,
      },
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Order not found' });
    }
    next(error);
  }
});

// Confirm reservation (admin only) - without creating order
router.post('/confirm/:reservationId', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { reservationId } = req.params;

    const reservation = await Reservation.findByIdAndUpdate(
      reservationId,
      {
        status: 'confirmed',
        confirmedAt: new Date(),
      },
      { new: true }
    )
      .populate('userId', 'name email')
      .populate('tableId', 'name')
      .lean();

    if (!reservation) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    res.json({
      reservation: {
        id: reservation._id.toString(),
        status: reservation.status,
        confirmedAt: reservation.confirmedAt,
      },
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    next(error);
  }
});

export default router;

