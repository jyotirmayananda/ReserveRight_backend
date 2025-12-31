import express from "express";
import Reservation from "../models/Reservation.js";
import mongoose from "mongoose";

const router = express.Router();

// Dev-only: list all reservations with populated user/table
router.get("/reservations", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }

    const reservations = await Reservation.find()
      .populate("userId", "name email")
      .populate("tableId", "name capacity")
      .sort({ reservationDate: -1, timeSlot: -1 })
      .lean();

    const formatted = reservations.map((r) => ({
      id: r._id.toString(),
      userId: r.userId?._id?.toString() || null,
      userName: r.userId?.name || r.customerName || null,
      userEmail: r.userId?.email || r.customerEmail || null,
      tableId: r.tableId?._id?.toString() || null,
      tableName: r.tableId?.name || null,
      guestCount: r.guestCount,
      reservationDate: r.reservationDate,
      timeSlot: r.timeSlot,
      status: r.status,
    }));

    res.json({ reservations: formatted });
  } catch (err) {
    next(err);
  }
});

export default router;
