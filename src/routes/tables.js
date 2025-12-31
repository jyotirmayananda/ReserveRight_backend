import express from 'express';
import { z } from 'zod';
import Table from '../models/Table.js';
import Reservation from '../models/Reservation.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

const tableSchema = z.object({
  name: z.string().min(1, 'Table name is required'),
  capacity: z.number().int().min(1, 'Capacity must be at least 1'),
});

// Get all tables
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const tables = await Table.find().sort({ name: 1 }).lean();
    const formatted = tables.map((table) => ({
      id: table._id.toString(),
      name: table.name,
      capacity: table.capacity,
    }));
    res.json({ tables: formatted });
  } catch (error) {
    next(error);
  }
});

// Get single table
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const table = await Table.findById(id).lean();

    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    res.json({
      table: {
        id: table._id.toString(),
        name: table.name,
        capacity: table.capacity,
      },
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Table not found' });
    }
    next(error);
  }
});

// Create table (admin only)
router.post('/', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const validatedData = tableSchema.parse(req.body);
    const { name, capacity } = validatedData;

    const newTable = await Table.create({ name, capacity });

    res.status(201).json({
      table: {
        id: newTable._id.toString(),
        name: newTable.name,
        capacity: newTable.capacity,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update table (admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = tableSchema.parse(req.body);
    const { name, capacity } = validatedData;

    const existingTable = await Table.findById(id);
    if (!existingTable) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Check if reducing capacity would affect existing reservations
    if (capacity < existingTable.capacity) {
      const reservationsWithMoreGuests = await Reservation.countDocuments({
        tableId: new mongoose.Types.ObjectId(id),
        guestCount: { $gt: capacity },
      });

      if (reservationsWithMoreGuests > 0) {
        return res.status(400).json({
          error: `Cannot reduce capacity. There are ${reservationsWithMoreGuests} reservation(s) with more guests than the new capacity.`,
        });
      }
    }

    const updatedTable = await Table.findByIdAndUpdate(id, { name, capacity }, { new: true });

    res.json({
      table: {
        id: updatedTable._id.toString(),
        name: updatedTable.name,
        capacity: updatedTable.capacity,
      },
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Table not found' });
    }
    next(error);
  }
});

// Delete table (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const table = await Table.findById(id);
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Delete associated reservations
    await Reservation.deleteMany({ tableId: new mongoose.Types.ObjectId(id) });

    await Table.findByIdAndDelete(id);

    res.status(204).send();
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Table not found' });
    }
    next(error);
  }
});

export default router;
