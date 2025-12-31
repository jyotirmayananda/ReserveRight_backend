import connectDB from "./database.js";
import User from "../models/User.js";
import Table from "../models/Table.js";
import Reservation from "../models/Reservation.js";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import path from "path";

export async function initDatabase() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Check if users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const hashedPassword = await bcrypt.hash("password123", 10);

      // Create default admin and customer users
      await User.create([
        {
          email: "admin@example.com",
          name: "Bob Admin",
          password: hashedPassword,
          role: "admin",
        },
        {
          email: "customer@example.com",
          name: "Alice Customer",
          password: hashedPassword,
          role: "customer",
        },
      ]);
      console.log("Default users created");
    }

    // Check if tables exist
    const tableCount = await Table.countDocuments();
    if (tableCount === 0) {
      await Table.create([
        { name: "Table 1", capacity: 2 },
        { name: "Table 2", capacity: 2 },
        { name: "Table 3", capacity: 4 },
        { name: "Table 4", capacity: 4 },
        { name: "Table 5", capacity: 6 },
        { name: "Table 6", capacity: 8 },
      ]);
      console.log("Default tables created");
    }

    console.log("Database initialized successfully!");
    return { success: true };
  } catch (error) {
    console.error("Error initializing database:", error);
    return { success: false, error };
  }
}

// If this file is executed directly (node src/db/init.js), run the initializer
const __filename = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  initDatabase().then((result) => {
    if (result.success) process.exit(0);
    process.exit(1);
  });
}
