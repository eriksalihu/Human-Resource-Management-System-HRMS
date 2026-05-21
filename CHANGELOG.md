# Changelog

All notable changes to the HR Management System are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-05-28

First complete release — a full-stack HRMS covering the employee
lifecycle from hiring through payroll, leave, attendance, performance,
and training, behind a hardened authentication layer.

### Authentication & Security
- JWT access tokens + httpOnly refresh-token **rotation** with
  family-based **reuse detection**.
- Account **lockout** after repeated failed logins; per-endpoint and
  global **rate limiting** (`ERR_RATE_LIMITED`).
- **Password reset** flow — emailed, single-use, time-limited tokens
  (stored hashed); refresh tokens revoked on reset.
- Hardened **CORS** allowlist, env-resolved **SameSite/Secure** cookies,
  HTTP→HTTPS redirect, Helmet headers.
- Input **sanitization** + length validation matching DB constraints;
  parameterized SQL throughout (injection test suite included).

### Core HR Modules
- **Employees** — CRUD, search/filter, cascading department→position
  selection, 4-step create wizard, CSV export, virtualized large lists.
- **Departments & Positions** — CRUD with manager assignment.
- **Salaries & Payroll** — net-pay auto-calculation, bulk monthly
  payroll, payroll report with department breakdown + year-over-year.
- **Leave** — request → approve/reject workflow, overlap detection,
  per-type balance tracking, bulk approval.
- **Attendance** — check-in/out, statuses, monthly report (JSON/CSV).
- **Performance** — reviews + team analytics (top/bottom, gaps).
- **Trainings** — sessions, enrollment, ratings, completion analytics.
- **Documents** — hardened uploads (type/size whitelist, sanitized
  filenames, virus-scan hook), expiry alerts.
- **Dashboard** — KPI cards, charts, recent-activity feed
  (payroll figures gated to HR/Admin).
- **Notifications**, **audit logging**, role-based access control.

### Platform & Performance
- React 19 + Vite SPA with **route-based code splitting** and
  **manual chunk splitting**.
- **SWR caching** in `useFetch`, Axios **request deduplication**,
  `useTransition`-powered debounce.
- Responsive (mobile→desktop), **dark mode**, contextual **skeleton
  loaders**, lazy images.
- **Accessibility** — focus traps, ARIA, keyboard navigation,
  skip-to-content link, focus-visible outlines.
- Express MVC backend with `mysql2` pooling + **connection retry /
  warmup**, standardized error envelope, **/api/health** endpoint.

### Tooling & Docs
- Backend test suites (Jest + Supertest): auth, employees, departments,
  salaries, leave, security, dashboard, full-workflow integration.
- Ordered SQL **migration runner** + seed runner + **mysqldump backup**
  script.
- Documentation: README, API reference, deployment guide, user guide.

[1.0.0]: https://github.com/eriksalihu/Human-Resource-Management-System-HRMS/releases/tag/v1.0.0
