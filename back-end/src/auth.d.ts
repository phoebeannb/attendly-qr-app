import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import type { Role, User } from "@prisma/client";
export declare const registerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    password: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<{
        ORGANIZER: "ORGANIZER";
        STUDENT: "STUDENT";
    }>>;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    password: z.ZodString;
}, z.core.$strip>;
export type AuthUser = Pick<User, "id" | "name" | "email" | "role">;
export declare const hashPassword: (password: string) => Promise<string>;
export declare const verifyPassword: (password: string, hash: string) => Promise<boolean>;
export declare const createToken: (user: AuthUser) => string;
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
export declare function requireRole(role: Role): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map