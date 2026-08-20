import jwt from "jsonwebtoken";
import { JwtUserPayload } from "./types";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

export function signJwt(payload: JwtUserPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "1d" });
}

export function verifyJwt(token: string): JwtUserPayload {
  return jwt.verify(token, getJwtSecret()) as JwtUserPayload;
}
