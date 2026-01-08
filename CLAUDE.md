# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrashPerson is a full-stack CRM application for waste management/trash pickup businesses. It handles customer management, lead tracking, appointment scheduling, route planning, and billing.

## Development Commands

### Server (Express.js backend)
```bash
cd server
npm install          # Install dependencies
npm run dev          # Start with auto-reload (--watch)
npm start            # Run server (port 3001)
```

### Client (React frontend)
```bash
cd client
npm install          # Install dependencies
npm run dev          # Start Vite dev server (port 3000)
npm run build        # Production build
npm run preview      # Preview production build
```

### Running Both
Start server first (`cd server && npm run dev`), then client in separate terminal (`cd client && npm run dev`). Client proxies `/api` requests to server.

## Architecture

```
trashperson/
├── client/          # React 18 + Vite + Tailwind CSS
├── server/          # Express.js + sql.js (SQLite)
└── database/        # SQLite database file and schema
```

### Tech Stack
- **Frontend**: React 18, Vite, React Router DOM 6, Tailwind CSS
- **Backend**: Express.js, sql.js (SQLite wrapper), JWT auth, bcryptjs
- **Payments**: Stripe
- **Email**: Nodemailer
- **Deployment**: Vercel (client), Railway (server)

### Database
- SQLite database at `database/trashperson.db`
- Schema defined in `database/schema.sql`
- Server uses custom `DatabaseWrapper` class in `server/index.js` that wraps sql.js with better-sqlite3-like API (`.prepare().run()`, `.prepare().get()`, `.prepare().all()`)
- Database auto-initializes from schema on server startup

### Authentication
- JWT tokens with 7-day expiration
- Tokens stored in client localStorage
- Bearer token in Authorization header
- Role-based middleware: `isAdmin`, `isDispatcher`, `isDriver`
- User roles: admin, dispatcher, driver

### API Structure
All endpoints under `/api`:
- `/api/auth` - register, login, me
- `/api/customers` - customer CRUD with addresses
- `/api/leads` - lead pipeline management
- `/api/appointments` - scheduling with recurrence
- `/api/invoices` - billing with auto-generated invoice numbers
- `/api/routes` - route planning with stops
- `/api/services` - service catalog
- `/api/health` - health check

### Client Structure
- Pages: Login, Dashboard, Customers, Leads, Scheduling, Billing, RoutePlanner
- `client/src/services/api.js` - centralized API client with token handling
- `client/src/components/Layout.jsx` - navigation sidebar

## Configuration

Server requires `.env` file (copy from `server/.env.example`):
- `JWT_SECRET` - Token signing (change from default)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Payments
- `GOOGLE_MAPS_API_KEY` - Maps integration
- `SMTP_*` - Email configuration
