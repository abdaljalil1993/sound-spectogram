import { NextFunction, Request, Response } from "express";
import { HttpError } from "./http-error";

export function notFoundMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, "Route not found"));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  const message = process.env.NODE_ENV === "production" ? "Internal server error" : "Internal server error";
  res.status(500).json({ message });
}
