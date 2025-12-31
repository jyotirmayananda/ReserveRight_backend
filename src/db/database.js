import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/restaurant-reservations";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null, memoryServer: null };
}

async function startInMemoryServer() {
  if (cached.memoryServer) return cached.memoryServer;
  const mongod = await MongoMemoryServer.create();
  cached.memoryServer = mongod;
  const uri = mongod.getUri();
  console.warn("Using in-memory MongoDB for development at", uri);
  return mongod;
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // keepAlive options can be added if desired
    };

    // Try primary URI first; if it fails and USE_IN_MEMORY_DB=true, fall back
    cached.promise = (async () => {
      try {
        await mongoose.connect(MONGODB_URI, opts);
        console.log("Connected to MongoDB at", MONGODB_URI);
        return mongoose;
      } catch (err) {
        console.error(
          "Failed to connect to MongoDB at",
          MONGODB_URI,
          err.message || err
        );
        // If explicitly requested, or if no external URI provided, start in-memory server
        if (
          process.env.USE_IN_MEMORY_DB === "true" ||
          !process.env.MONGODB_URI
        ) {
          const mongod = await startInMemoryServer();
          const memUri = mongod.getUri();
          await mongoose.connect(memUri, opts);
          console.log("Connected to in-memory MongoDB");
          return mongoose;
        }

        // Rethrow so caller can handle
        throw err;
      }
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
