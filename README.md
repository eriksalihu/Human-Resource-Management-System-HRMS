# HR Management System (Sistemi për Menaxhimin e Resurseve Njerëzore)

A full-stack Human Resource Management System built as a university project for **Kolegji UBT** — Lab Course 1 (Programming), Academic Year 2025/2026.

## Description

This application provides a comprehensive solution for managing human resources within an organization. It covers employee management, department organization, attendance tracking, leave requests, salary processing, performance reviews, and training management.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js (v18+) |
| **Backend** | Express.js |
| **Frontend** | React 18+ (Vite) |
| **Styling** | Tailwind CSS 3+ |
| **Database** | MySQL 8 |
| **Authentication** | JWT (Access + Refresh Tokens) |
| **Validation** | express-validator |
| **HTTP Client** | Axios |
| **Charts** | Recharts |

## Team

| Role | Member |
|------|--------|
| **Dev A** — Team Leader (Backend-first) | Erik Salihu |
| **Dev B** — Partner (Frontend-first) | Donart Krasniqi |

## Features

- **Employee Management** — CRUD operations for employee records
- **Department & Position Management** — Organizational structure
- **Attendance Tracking** — Daily attendance logging
- **Leave Management** — Request, approve, and track leave
- **Salary Processing** — Monthly salary calculations
- **Performance Reviews** — Employee evaluations
- **Training Management** — Training sessions and participation
- **Document Management** — Employee document storage
- **Dashboard & Analytics** — Visual reports with charts
- **Role-Based Access Control** — Admin, HR Manager, Department Manager, Employee

## Setup Instructions

### Prerequisites

- Node.js v18+
- MySQL 8
- npm or yarn

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
npm install
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── config/        # Database and app configuration
│   │   ├── controllers/   # Route controllers (MVC)
│   │   ├── middleware/     # Auth, validation, audit middleware
│   │   ├── models/        # Database models (raw SQL)
│   │   ├── routes/        # Express route definitions
│   │   └── services/      # Business logic services
│   ├── database/
│   │   ├── migrations/    # SQL migration files
│   │   └── seeds/         # Seed data
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── layouts/       # Layout wrappers
│   │   ├── services/      # API service layer (Axios)
│   │   ├── context/       # React context providers
│   │   └── utils/         # Utility functions
│   └── package.json
└── README.md
```

## License

This project is developed for educational purposes at Kolegji UBT.
