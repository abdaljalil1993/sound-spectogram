import { NextFunction, Request, Response } from "express";
import { UserRole } from "../entities/User";
import { HttpError } from "./http-error";
import { verifyJwt } from "./jwt";

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new HttpError(401, "Authentication required");
    }

    const token = authHeader.slice(7);
    const payload = verifyJwt(token);

    req.user = {
      userId: payload.userId,
      username: payload.username,
      role: payload.role
    };

    next();
  } catch (_error) {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, "You do not have permission to access this resource"));
      return;
    }

    next();
  };
}
