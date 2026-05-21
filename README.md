# HR Management System (Sistemi për Menaxhimin e Resurseve Njerëzore)

A full-stack Human Resource Management System built as a university project for **Kolegji UBT** — Lab Course 1 (Programming), Academic Year 2025/2026.

## Description

This application provides a comprehensive solution for managing human resources within an organization. It covers employee management, department organization, attendance tracking, leave requests, salary processing, performance reviews, training management, document storage, and a role-aware analytics dashboard — all behind a hardened JWT authentication layer with refresh-token rotation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js (v18+) |
| **Backend** | Express.js (MVC) |
| **Frontend** | React 19 (Vite) |
| **Styling** | Tailwind CSS 3 (class-based dark mode) |
| **Database** | MySQL 8 (`mysql2` promise pool, raw parameterized SQL) |
| **Authentication** | JWT access tokens + httpOnly refresh-token rotation |
| **Validation** | express-validator |
| **HTTP Client** | Axios (interceptor-driven token refresh) |
| **Testing** | Jest + Supertest (backend integration suites) |
| **Email** | Nodemailer (graceful log-only fallback in dev) |

## Team

| Role | Member |
|------|--------|
| **Dev A** — Team Leader (Backend-first) | Erik Salihu |
| **Dev B** — Partner (Frontend-first) | Donart Krasniqi |

## Features

- **Employee Management** — full CRUD, cascading department→position selection, multi-step create wizard, CSV export
- **Department & Position Management** — organizational structure with manager assignment
- **Attendance Tracking** — daily logging, monthly reports, CSV export
- **Leave Management** — request → approve/reject workflow, overlap detection, balance tracking
- **Salary Processing** — net-pay auto-calculation, bulk monthly payroll, payroll report with year-over-year comparison
- **Performance Reviews** — employee evaluations + team analytics for managers
- **Training Management** — sessions, enrollment, completion + rating analytics
- **Document Management** — hardened uploads (type/size whitelist, filename sanitization, virus-scan hook)
- **Dashboard & Analytics** — KPI cards, charts, recent-activity feed (payroll figures gated to HR/Admin)
- **Authentication** — register, login, logout, refresh-token rotation with reuse detection, account lockout, password reset
- **Role-Based Access Control** — Admin, HR Manager, Department Manager, Employee
- **Cross-cutting** — responsive (mobile→desktop), dark mode, accessibility (focus traps, ARIA, keyboard nav), rate limiting, audit logging

## Setup Instructions

### Prerequisites

- **Node.js** v18 or newer
- **MySQL** 8
- **npm** (bundled with Node)

### 1. Database

Create the database, then run the migrations in order (they're numbered `001_…` → `021_…`):

```bash
mysql -u root -p -e "CREATE DATABASE hrms CHARACTER SET utf8mb4;"
# Apply migrations (any ordered runner works); e.g. with the mysql CLI:
for f in backend/database/migrations/0*.sql; do mysql -u root -p hrms < "$f"; done
# Optional: seed reference data (roles, demo records)
for f in backend/database/seeds/*.sql; do mysql -u root -p hrms < "$f"; done
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # then edit with your DB credentials + secrets
npm install
npm run dev               # nodemon on http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev               # Vite dev server on http://localhost:5173
```

The frontend proxies API calls to `VITE_API_BASE_URL` (defaults to `http://localhost:5000/api`).

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | API port (default `5000`) |
| `NODE_ENV` | no | `development` \| `production` \| `test` |
| `DB_HOST` | yes | MySQL host |
| `DB_PORT` | no | MySQL port (default `3306`) |
| `DB_USER` | yes | MySQL user |
| `DB_PASS` | yes | MySQL password |
| `DB_NAME` | yes | Database name (use a disposable schema for tests, e.g. `hrms_test`) |
| `JWT_SECRET` | yes | Access-token signing secret |
| `JWT_REFRESH_SECRET` | yes | Refresh-token signing secret |
| `JWT_EXPIRE` | no | Access-token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRE` | no | Refresh-token TTL (default `7d`) |
| `CORS_ORIGIN` | no | Comma-separated allowed origins (default `http://localhost:5173`) |
| `COOKIE_SAMESITE` | no | Override refresh-cookie SameSite (`none`/`lax`/`strict`) |
| `APP_URL` | no | Public SPA origin used to build password-reset links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no | Email transport; when unset, emails are logged instead of sent |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | no | API base URL (default `http://localhost:5000/api`) |
| `VITE_APP_VERSION` | no | Version stamp shown in the footer |

## Available Scripts

### Backend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start the production server |
| `npm test` | Run the Jest + Supertest suites (`--runInBand`) |
| `npm run test:watch` | Run tests in watch mode |

> Integration tests hit a real database — point `DB_NAME` at a **disposable** schema: `DB_NAME=hrms_test npm test`.

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build (manual chunk splitting) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint over the source tree |

## API Overview

Base path: `/api`. All endpoints (except `/api/health`, `/api/auth/*`) require a `Bearer` access token; most also enforce role-based authorization. Errors follow a single envelope: `{ success: false, message, statusCode, errors?, code? }`.

| Resource | Base route | Highlights |
|----------|-----------|------------|
| **Auth** | `/api/auth` | `register`, `login`, `logout`, `refresh-token`, `forgot-password`, `reset-password`, `profile` |
| **Health** | `/api/health` | Liveness/readiness — status, DB connectivity, uptime, version, memory |
| **Employees** | `/api/employees` | CRUD, search/filter, `export/csv`, `/me`, subordinates |
| **Departments** | `/api/departments` | CRUD, manager assignment |
| **Positions** | `/api/positions` | CRUD, filter by department |
| **Salaries** | `/api/salaries` | CRUD, `bulk`, `payroll/summary`, `payroll/report` |
| **Leave requests** | `/api/leave-requests` | create, `approve`, `reject`, `/me`, `/pending`, balance |
| **Attendance** | `/api/attendances` | CRUD, `check-in`, `check-out`, monthly report (JSON/CSV) |
| **Performance** | `/api/performance-reviews` | CRUD, `statistics`, `team` analytics |
| **Trainings** | `/api/trainings` + `/api/training-participants` | CRUD, enrollment, reporting |
| **Documents** | `/api/documents` | hardened upload, download, expiry alerts |
| **Notifications** | `/api/notifications` | list, mark read, delete |
| **Dashboard** | `/api/dashboard` | `overview`, `charts`, `recent-activities` |
| **Users / Roles** | `/api/users` | account management (Admin) |
| **Audit logs** | `/api/audit-logs` | mutation history (Admin/HR) |

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── config/        # DB pool (with retry/warmup), CORS, JWT, helmet
│   │   ├── controllers/   # Request handlers (MVC)
│   │   ├── middleware/    # auth, authorize, validate, sanitize, errorHandler, auditLog, rate limits
│   │   ├── models/        # Data access — raw parameterized SQL
│   │   ├── routes/        # Express route definitions (+ named-route ordering before /:id)
│   │   ├── services/      # Business logic (auth, token, email)
│   │   ├── tests/         # Jest + Supertest suites (incl. integration/, sqlInjection)
│   │   ├── app.js         # Express app assembly (exported for tests)
│   │   └── server.js      # Listen-first bootstrap + background DB warmup
│   ├── database/
│   │   ├── migrations/    # Ordered SQL migrations (001 → 021)
│   │   └── seeds/         # Seed data
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios instance + per-resource API modules
│   │   ├── components/    # Reusable UI + per-feature components
│   │   ├── pages/         # Route-level page components (lazy-loaded)
│   │   ├── layouts/       # AuthLayout, MainLayout
│   │   ├── context/       # Auth, Theme, Notification providers
│   │   ├── hooks/         # useFetch (SWR), useDebounce, useAuth
│   │   ├── types/         # Shared JSDoc typedefs
│   │   └── utils/         # CSV export, formatting helpers
│   ├── tailwind.config.js # Dark mode, brand palette, keyframes
│   ├── vite.config.js     # Manual chunk splitting
│   └── package.json
└── README.md
```

## Security Notes

- Passwords hashed with **bcrypt** (12 rounds); password-reset tokens stored as **SHA-256 hashes** (single-use, 1-hour expiry).
- **Refresh-token rotation** with family-based reuse detection; access tokens are short-lived and fingerprinted.
- **Rate limiting** on auth endpoints; **account lockout** after repeated failed logins.
- Inputs validated + length-capped to match DB column sizes; all SQL is parameterized (injection test suite included).
- Production: secure/SameSite cookies, CORS allowlist, HTTP→HTTPS redirect, Helmet headers.

## License

ISC — university coursework project for Kolegji UBT.
