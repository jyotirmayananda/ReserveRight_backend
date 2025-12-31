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

// Helper: build allowed origins list from environment
const allowedOriginsEnv =
  process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "";
const allowedOrigins = allowedOriginsEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Ensure JWT secret is present (fail fast in production, fallback in dev)
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Missing required environment variable: JWT_SECRET. Exiting."
    );
    process.exit(1);
  } else {
    console.warn(
      "JWT_SECRET is not set — using a development fallback secret. Do not use in production."
    );
    process.env.JWT_SECRET = "dev-secret";
  }
}

// Simple IP range checker for /24 CIDRs (IPv4 and IPv4-mapped IPv6)
const allowedIpRangesEnv = process.env.ALLOWED_IP_RANGES || "";
const allowedIpRanges = allowedIpRangesEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function normalizeIp(ip) {
  if (!ip) return "";
  // handle IPv4-mapped IPv6 like ::ffff:74.220.48.12
  const v4mapped = ip.match(/(?:.*:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return v4mapped[1];
  return ip;
}

function ipAllowed(ip) {
  if (!allowedIpRanges.length) return true; // no restriction configured
  const v4 = normalizeIp(ip);
  if (!v4) return false;
  for (const r of allowedIpRanges) {
    // Support only /24 in this simple implementation
    const m = r.match(/^(\d+\.\d+\.\d+)\.0\/24$/);
    if (m) {
      const prefix = m[1] + ".";
      if (v4.startsWith(prefix)) return true;
    } else if (r === v4) {
      return true;
    }
  }
  return false;
}

// IP allowlist middleware
app.use((req, res, next) => {
  const remote = req.ip || req.connection?.remoteAddress || "";
  if (!ipAllowed(remote)) {
    console.warn(`Blocked request from IP ${remote}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// CORS middleware with support for multiple allowed origins
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (e.g. server-to-server, same-origin)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
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
