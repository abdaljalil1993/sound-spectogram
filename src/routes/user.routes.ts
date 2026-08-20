import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { UserRole } from "../entities/User";
import { authMiddleware, requireRole } from "../utils/auth.middleware";

const router = Router();

router.post("/auth/login", userController.login);

router.get("/users", authMiddleware, requireRole(UserRole.ADMIN), userController.getUsers);
router.post("/users", authMiddleware, requireRole(UserRole.ADMIN), userController.createUser);
router.get("/users/:id", authMiddleware, requireRole(UserRole.ADMIN), userController.getUserById);
router.put("/users/:id", authMiddleware, requireRole(UserRole.ADMIN), userController.updateUser);
router.delete("/users/:id", authMiddleware, requireRole(UserRole.ADMIN), userController.deleteUser);

export default router;
