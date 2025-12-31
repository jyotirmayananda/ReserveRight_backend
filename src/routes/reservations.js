import express from "express";
import { z } from "zod";
import Reservation from "../models/Reservation.js";
import Table from "../models/Table.js";
import User from "../models/User.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";
import mongoose from "mongoose";

const router = express.Router();

const createReservationSchema = z.object({
  guestCount: z.number().int().min(1, "Must have at least one guest"),
  reservationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  timeSlot: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time slot format"),
});

const createPublicReservationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number is required"),
  guestCount: z.number().int().min(1, "Must have at least one guest"),
  reservationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  timeSlot: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time slot format"),
});

const updateReservationSchema = z.object({
  guestCount: z.number().int().min(1).optional(),
  reservationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timeSlot: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  tableId: z.string().optional(),
});



// Get all reservations (admin only) or user's reservations
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const { date } = req.query;
    let query = {};
    let populateFields = [];

    if (req.user.role === "admin") {
      // Admin can see all reservations
      if (date) {
        query.reservationDate = date;
      }
      populateFields = [
        { path: "userId", select: "name email" },
        { path: "tableId", select: "name" },
      ];
    } else {
      // Customer can only see their own reservations
      query.userId = new mongoose.Types.ObjectId(req.user.id);
      if (date) {
        query.reservationDate = date;
      }
      populateFields = [{ path: "tableId", select: "name" }];
    }

    const reservations = await Reservation.find(query)
      .populate(populateFields)
      .sort({ reservationDate: -1, timeSlot: -1 })
      .lean();

    // Format reservations for response
    const formattedReservations = reservations.map((res) => {
      const formatted = {
        id: res._id.toString(),
        tableId: res.tableId._id
          ? res.tableId._id.toString()
          : res.tableId.toString(),
        guestCount: res.guestCount,
        reservationDate: res.reservationDate,
        timeSlot: res.timeSlot,
        tableName: res.tableId.name || res.tableId,
        status: res.status || "pending",
        confirmedAt: res.confirmedAt || null,
      };

      // Handle user-based or guest bookings
      if (res.userId) {
        formatted.userId = res.userId._id
          ? res.userId._id.toString()
          : res.userId.toString();
        if (req.user.role === "admin") {
          formatted.userName = res.userId.name || res.userId;
          formatted.userEmail = res.userId.email || res.userId;
        }
      } else {
        // Guest booking
        formatted.customerName = res.customerName;
        formatted.customerEmail = res.customerEmail;
        formatted.customerPhone = res.customerPhone;
        if (req.user.role === "admin") {
          formatted.userName = res.customerName;
          formatted.userEmail = res.customerEmail;
        }
      }

      return formatted;
    });

    res.json({ reservations: formattedReservations });
  } catch (error) {
    next(error);
  }
});

// Get single reservation
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    let query = { _id: new mongoose.Types.ObjectId(id) };
    let populateFields = [];

    if (req.user.role === "admin") {
      populateFields = [
        { path: "userId", select: "name email" },
        { path: "tableId", select: "name" },
      ];
    } else {
      query.userId = new mongoose.Types.ObjectId(req.user.id);
      populateFields = [{ path: "tableId", select: "name" }];
    }

    const reservation = await Reservation.findOne(query)
      .populate(populateFields)
      .lean();

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const formatted = {
      id: reservation._id.toString(),
      userId: reservation.userId._id
        ? reservation.userId._id.toString()
        : reservation.userId.toString(),
      tableId: reservation.tableId._id
        ? reservation.tableId._id.toString()
        : reservation.tableId.toString(),
      guestCount: reservation.guestCount,
      reservationDate: reservation.reservationDate,
      timeSlot: reservation.timeSlot,
      tableName: reservation.tableId.name || reservation.tableId,
      status: reservation.status || "pending",
      confirmedAt: reservation.confirmedAt || null,
    };

    if (req.user.role === "admin") {
      formatted.userName = reservation.userId.name || reservation.userId;
      formatted.userEmail = reservation.userId.email || reservation.userId;
    }

    res.json({ reservation: formatted });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Reservation not found" });
    }
    next(error);
  }
});

// Create public reservation (no auth required)
router.post("/public", async (req, res, next) => {
  try {
    console.log("/reservations/public called with body:", req.body);
    const validatedData = createPublicReservationSchema.parse(req.body);
    const { name, email, phone, guestCount, reservationDate, timeSlot } =
      validatedData;

    // Validate date is not in the past
    const selectedDate = new Date(reservationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      return res
        .status(400)
        .json({ error: "Cannot make reservations for past dates" });
    }

    // Get all tables with sufficient capacity
    const availableTables = await Table.find({
      capacity: { $gte: guestCount },
    }).sort({ capacity: 1 });

    if (availableTables.length === 0) {
      return res.status(400).json({
        error: "No tables available for the selected number of guests",
      });
    }

    let newReservation = null;

    for (const table of availableTables) {
      try {
        const reservation = await Reservation.create({
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
          tableId: table._id,
          guestCount,
          reservationDate,
          timeSlot,
          status: "pending",
        });
        newReservation = reservation;
        break; // Exit loop on successful creation
      } catch (error) {
        if (error.code === 11000) {
          // This table was booked by someone else, try the next one
          continue;
        }
        // For other errors, bubble them up
        throw error;
      }
    }

    if (!newReservation) {
      return res.status(409).json({
        error:
          "No tables available for the selected date and time. Please try another slot.",
      });
    }

    const populated = await Reservation.findById(newReservation._id)
      .populate("tableId", "name")
      .lean();

    const formatted = {
      id: populated._id.toString(),
      tableId: populated.tableId._id.toString(),
      guestCount: populated.guestCount,
      reservationDate: populated.reservationDate,
      timeSlot: populated.timeSlot,
      tableName: populated.tableId.name,
      customerName: populated.customerName,
      customerEmail: populated.customerEmail,
      customerPhone: populated.customerPhone,
    };

    console.log("Created public reservation:", populated._id.toString());
    res.status(201).json({ reservation: formatted });
  } catch (error) {
    console.error("Error in /reservations/public:", error);
    next(error);
  }
});

// Create reservation (authenticated)
router.post(
  "/",
  authenticateToken,
  requireRole(["customer", "admin"]),
  async (req, res, next) => {
    try {
      console.log(
        "/reservations (auth) called by user:",
        req.user?.id,
        "body:",
        req.body
      );
      const validatedData = createReservationSchema.parse(req.body);
      const { guestCount, reservationDate, timeSlot } = validatedData;

      // Validate date is not in the past
      const selectedDate = new Date(reservationDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        return res
          .status(400)
          .json({ error: "Cannot make reservations for past dates" });
      }

      // Get all tables with sufficient capacity
      const availableTables = await Table.find({
        capacity: { $gte: guestCount },
      }).sort({ capacity: 1 });

      if (availableTables.length === 0) {
        return res.status(400).json({
          error: "No tables available for the selected number of guests",
        });
      }

      let newReservation = null;

      for (const table of availableTables) {
        try {
          const reservation = await Reservation.create({
            userId: new mongoose.Types.ObjectId(req.user.id),
            tableId: table._id,
            guestCount,
            reservationDate,
            timeSlot,
            status: "pending",
          });
          newReservation = reservation;
          break; // Exit loop on successful creation
        } catch (error) {
          if (error.code === 11000) {
            // This table was booked by someone else, try the next one
            continue;
          }
          // For other errors, bubble them up
          throw error;
        }
      }

      if (!newReservation) {
        return res.status(409).json({
          error:
            "No tables available for the selected date and time. Please try another slot.",
        });
      }

      const populated = await Reservation.findById(newReservation._id)
        .populate("tableId", "name")
        .lean();

      const formatted = {
        id: populated._id.toString(),
        userId: populated.userId.toString(),
        tableId: populated.tableId._id.toString(),
        guestCount: populated.guestCount,
        reservationDate: populated.reservationDate,
        timeSlot: populated.timeSlot,
        tableName: populated.tableId.name,
      };

      console.log("Created auth reservation:", populated._id.toString());
      res.status(201).json({ reservation: formatted });
    } catch (error) {
      console.error("Error in /reservations (auth):", error);
      next(error);
    }
  }
);

// Update reservation (admin only)
router.put(
  "/:id",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const validatedData = updateReservationSchema.parse(req.body);

      // Check if reservation exists
      const existingReservation = await Reservation.findById(id);
      if (!existingReservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }

      const updates = {};

      

      // If updating guest count, verify table capacity
      if (validatedData.guestCount !== undefined) {
        const tableId =
          validatedData.tableId || existingReservation.tableId.toString();
        const table = await Table.findById(tableId);
        if (!table) {
          return res.status(404).json({ error: "Table not found" });
        }
        if (validatedData.guestCount > table.capacity) {
          return res.status(400).json({
            error: `Table capacity (${table.capacity}) is less than guest count (${validatedData.guestCount})`,
          });
        }
        updates.guestCount = validatedData.guestCount;
      }

      if (validatedData.reservationDate) {
        updates.reservationDate = validatedData.reservationDate;
      }
      if (validatedData.timeSlot) {
        updates.timeSlot = validatedData.timeSlot;
      }
      if (validatedData.tableId) {
        updates.tableId = new mongoose.Types.ObjectId(validatedData.tableId);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updatedReservation = await Reservation.findByIdAndUpdate(
        id,
        updates,
        { new: true }
      )
        .populate("userId", "name email")
        .populate("tableId", "name")
        .lean();

      const formatted = {
        id: updatedReservation._id.toString(),
        userId: updatedReservation.userId._id.toString(),
        tableId: updatedReservation.tableId._id.toString(),
        guestCount: updatedReservation.guestCount,
        reservationDate: updatedReservation.reservationDate,
        timeSlot: updatedReservation.timeSlot,
        tableName: updatedReservation.tableId.name,
        userName: updatedReservation.userId.name,
        userEmail: updatedReservation.userId.email,
      };

      res.json({ reservation: formatted });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          error: "Table is already reserved for the selected date and time",
        });
      }
      if (error.name === "CastError") {
        return res
          .status(404)
          .json({ error: "Reservation or table not found" });
      }
      next(error);
    }
  }
);

// Cancel reservation
router.delete("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    // Check permissions: admin can cancel any, customer can only cancel their own
    if (
      req.user.role !== "admin" &&
      reservation.userId.toString() !== req.user.id
    ) {
      return res.status(403).json({
        error: "You do not have permission to cancel this reservation",
      });
    }

    await Reservation.findByIdAndDelete(id);

    res.status(204).send();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Reservation not found" });
    }
    next(error);
  }
});

export default router;
