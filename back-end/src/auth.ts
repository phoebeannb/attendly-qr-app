import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import type { Role, User } from "@prisma/client";

const jwtSecret = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "local-development-secret");
if (!jwtSecret) {
  throw new Error("JWT_SECRET must be configured");
}

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(72),
  role: z.enum(["STUDENT", "ORGANIZER"]).default("STUDENT"),
});

export const loginSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});

export type AuthUser = Pick<User, "id" | "name" | "email" | "role">;

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const createToken = (user: AuthUser) =>
  jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "7d" });

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(header.slice(7), jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || !isRole(payload.role)) {
      throw new Error("Invalid token payload");
    }
    req.user = { id: payload.sub, name: "", email: "", role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

function isRole(value: unknown): value is Role {
  return value === "STUDENT" || value === "ORGANIZER";
}
