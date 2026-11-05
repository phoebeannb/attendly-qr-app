# Attendly

Attendly is a QR-based event attendance system for student organizations. Students register for events and receive a private QR pass; organizers manage events and check attendees in.

## Run locally

Requirements: Node.js 20+ and Docker Desktop.

```powershell
npm run install:all
docker compose up -d postgres
Copy-Item back-end\.env.example back-end\.env
npm run prisma:migrate --prefix back-end -- --name init
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:4000`.

If you are using an existing PostgreSQL instance, set `DATABASE_URL` in `back-end/.env` to that connection string instead of starting Docker.

## MVP routes

- Authentication: register, login, and current-user session
- Events: browse upcoming events; organizers create, update, delete, and list their events
- Registration: students register, cancel, and view QR passes
- Check-in: organizers validate a QR token for their own event and prevent duplicate check-ins
- Attendance: organizers can retrieve registrations and check-in timestamps for an event
