import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";
import { prisma } from "./db.js";
import { createToken, hashPassword, loginSchema, registerSchema, requireAuth, requireRole, verifyPassword, } from "./auth.js";
const app = express();
const port = Number(process.env.PORT ?? 4000);
const routeParam = (value) => typeof value === "string" ? value : "";
const configuredFrontendUrl = process.env.FRONTEND_URL;
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origin === configuredFrontendUrl || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Origin is not allowed"));
    },
}));
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/auth/register", async (req, res, next) => {
    try {
        const input = registerSchema.parse(req.body);
        const existing = await prisma.user.findUnique({ where: { email: input.email } });
        if (existing) {
            res.status(409).json({ error: "Email is already registered" });
            return;
        }
        const user = await prisma.user.create({
            data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: input.role },
            select: { id: true, name: true, email: true, role: true },
        });
        res.status(201).json({ user, token: createToken(user) });
    }
    catch (error) {
        next(error);
    }
});
app.post("/api/auth/login", async (req, res, next) => {
    try {
        const input = loginSchema.parse(req.body);
        const user = await prisma.user.findUnique({ where: { email: input.email } });
        if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }
        const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
        res.json({ user: safeUser, token: createToken(safeUser) });
    }
    catch (error) {
        next(error);
    }
});
app.get("/api/auth/me", requireAuth, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true, role: true },
        });
        if (!user) {
            res.status(401).json({ error: "User no longer exists" });
            return;
        }
        res.json({ user });
    }
    catch (error) {
        next(error);
    }
});
const eventSchema = z.object({
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().max(2000).optional(),
    venue: z.string().trim().min(2).max(200),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    capacity: z.coerce.number().int().positive().max(100000),
}).refine((value) => value.endsAt > value.startsAt, { message: "End time must be after start time" });
const publicEventSelect = {
    id: true,
    title: true,
    description: true,
    venue: true,
    startsAt: true,
    endsAt: true,
    capacity: true,
};
app.get("/api/events", async (_req, res, next) => {
    try {
        const events = await prisma.event.findMany({
            where: { startsAt: { gte: new Date() } },
            orderBy: { startsAt: "asc" },
            include: { _count: { select: { registrations: { where: { status: "REGISTERED" } } } } },
        });
        app.get("/api/events/qr/:token", async (req, res, next) => {
            try {
                const event = await prisma.event.findUnique({
                    where: { qrToken: routeParam(req.params.token) },
                    select: publicEventSelect,
                });
                if (!event) {
                    res.status(404).json({ error: "Event QR code is invalid or expired" });
                    return;
                }
                res.json({ event });
            }
            catch (error) {
                next(error);
            }
        });
        res.json({ events });
    }
    catch (error) {
        next(error);
    }
});
app.get("/api/organizer/events", requireAuth, requireRole("ORGANIZER"), async (req, res, next) => {
    try {
        const events = await prisma.event.findMany({
            where: { createdById: req.user.id },
            orderBy: { startsAt: "desc" },
            include: { _count: { select: { registrations: { where: { status: "REGISTERED" } } } } },
        });
        res.json({ events });
    }
    catch (error) {
        next(error);
    }
});
app.post("/api/organizer/events", requireAuth, requireRole("ORGANIZER"), async (req, res, next) => {
    try {
        const input = eventSchema.parse(req.body);
        const event = await prisma.event.create({
            data: { ...input, qrToken: crypto.randomBytes(32).toString("hex"), createdById: req.user.id },
        });
        res.status(201).json({ event });
    }
    catch (error) {
        next(error);
    }
});
app.patch("/api/organizer/events/:id", requireAuth, requireRole("ORGANIZER"), async (req, res, next) => {
    try {
        const input = eventSchema.partial().parse(req.body);
        const result = await prisma.event.updateMany({
            where: { id: routeParam(req.params.id), createdById: req.user.id },
            data: input,
        });
        if (!result.count) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        res.json({ message: "Event updated" });
    }
    catch (error) {
        next(error);
    }
});
app.delete("/api/organizer/events/:id", requireAuth, requireRole("ORGANIZER"), async (req, res, next) => {
    try {
        const result = await prisma.event.deleteMany({ where: { id: routeParam(req.params.id), createdById: req.user.id } });
        if (!result.count) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
app.post("/api/events/:eventId/register", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
    try {
        const event = await prisma.event.findUnique({
            where: { id: routeParam(req.params.eventId) },
            include: { _count: { select: { registrations: { where: { status: "REGISTERED" } } } } },
        });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        if (event._count.registrations >= event.capacity) {
            res.status(409).json({ error: "Event is full" });
            return;
        }
        const registration = await prisma.registration.create({
            data: { eventId: event.id, userId: req.user.id, qrToken: crypto.randomBytes(32).toString("hex") },
            include: { event: true },
        });
        res.status(201).json({ registration });
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("Unique constraint")) {
            res.status(409).json({ error: "You are already registered for this event" });
            return;
        }
        next(error);
    }
});
app.get("/api/me/registrations", requireAuth, async (req, res, next) => {
    try {
        const registrations = await prisma.registration.findMany({
            where: { userId: req.user.id, status: "REGISTERED" },
            include: { event: true },
            orderBy: { createdAt: "desc" },
        });
        res.json({ registrations });
    }
    catch (error) {
        next(error);
    }
});
app.delete("/api/registrations/:id", requireAuth, async (req, res, next) => {
    try {
        const result = await prisma.registration.updateMany({
            where: { id: routeParam(req.params.id), userId: req.user.id, status: "REGISTERED" },
            data: { status: "CANCELLED" },
        });
        if (!result.count) {
            res.status(404).json({ error: "Registration not found" });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
const checkInSchema = z.object({ token: z.string().trim().min(32).max(128), eventId: z.string().uuid() });
app.post("/api/check-in", requireAuth, requireRole("ORGANIZER"), async (req, res, next) => {
    try {
        const input = checkInSchema.parse(req.body);
        const registration = await prisma.registration.findUnique({
            where: { qrToken: input.token },
            include: { user: { select: { name: true, email: true } }, event: true },
        });
        if (!registration || registration.eventId !== input.eventId) {
            res.status(404).json({ error: "Invalid QR code for this event" });
            return;
        }
        if (registration.event.createdById !== req.user.id) {
            res.status(403).json({ error: "You do not manage this event" });
            return;
        }
        if (registration.status !== "REGISTERED") {
            res.status(409).json({ error: "This registration is cancelled" });
            return;
        }
        const updated = await prisma.registration.updateMany({
            where: { id: registration.id, checkedInAt: null, status: "REGISTERED" },
            data: { checkedInAt: new Date() },
        });
        if (!updated.count) {
            res.status(409).json({ error: "Already checked in" });
            return;
        }
        res.json({ message: "Check-in successful", attendee: registration.user });
    }
    catch (error) {
        next(error);
    }
});
app.get("/api/organizer/events/:eventId/attendance", requireAuth, requireRole("ORGANIZER"), async (req, res, next) => {
    try {
        const event = await prisma.event.findFirst({
            where: { id: routeParam(req.params.eventId), createdById: req.user.id },
            include: {
                registrations: {
                    where: { status: "REGISTERED" },
                    include: { user: { select: { name: true, email: true } } },
                    orderBy: { createdAt: "asc" },
                },
            },
        });
        if (!event) {
            res.status(404).json({ error: "Event not found" });
            return;
        }
        res.json({ event });
    }
    catch (error) {
        next(error);
    }
});
app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request", details: error.flatten() });
        return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
});
app.listen(port, () => console.log(`Server running on port ${port}`));
//# sourceMappingURL=app.js.map