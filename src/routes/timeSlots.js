import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get available time slots
router.get('/', authenticateToken, (req, res) => {
  // These could be made configurable in the future
  const timeSlots = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
  res.json({ timeSlots });
});

export default router;

