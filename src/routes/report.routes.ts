import { Router } from "express";
import { reportController } from "../controllers/report.controller";
import { UserRole } from "../entities/User";
import { authMiddleware, requireRole } from "../utils/auth.middleware";

const router = Router();

router.get("/reports", authMiddleware, requireRole(UserRole.ADMIN, UserRole.EMP), reportController.getReports);
router.post("/reports", authMiddleware, requireRole(UserRole.ADMIN, UserRole.EMP), reportController.createReport);
router.put("/reports/:id", authMiddleware, requireRole(UserRole.ADMIN, UserRole.EMP), reportController.updateReport);
router.delete("/reports/:id", authMiddleware, requireRole(UserRole.ADMIN), reportController.deleteReport);
router.delete("/reports", authMiddleware, requireRole(UserRole.ADMIN), reportController.deleteReports);

export default router;