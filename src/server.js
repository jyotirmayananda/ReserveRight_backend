import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./db/database.js";
import { initDatabase } from "./db/init.js";
import authRoutes from "./routes/auth.js";
import reservationsRoutes from "./routes/reservations.js";
import tablesRoutes from "./routes/tables.js";
import timeSlotsRoutes from "./routes/timeSlots.js";
import ordersRoutes from "./routes/orders.js";
import usersRoutes from "./routes/users.js";
import Customer from "./models/Customer.js"; // Import the new Customer model
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationsRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/time-slots", timeSlotsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/users", usersRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Connect to MongoDB and start server
async function startServer() {
  try {
    await connectDB();
    // Optionally seed DB on startup (useful for in-memory dev)
    if (
      process.env.USE_IN_MEMORY_DB === "true" ||
      process.env.SEED_DB === "true"
    ) {
      console.log(
        "Seeding database as requested (USE_IN_MEMORY_DB or SEED_DB)"
      );
      try {
        const result = await initDatabase();
        if (!result.success) {
          console.warn("Database seeding completed with errors:", result.error);
        }
      } catch (seedErr) {
        console.error("Error during DB seeding:", seedErr);
      }
    }
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
