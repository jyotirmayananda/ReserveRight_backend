import express from "express";
import User from "../models/User.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Get all users (admin only)
router.get(
  "/",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const users = await User.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .lean();
      const formatted = users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
      }));
      res.json({ users: formatted });
    } catch (err) {
      next(err);
    }
  }
);

// Delete user (admin only)
router.delete(
  "/:id",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await User.findByIdAndDelete(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
