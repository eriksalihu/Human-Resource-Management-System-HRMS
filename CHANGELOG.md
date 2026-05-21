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

### Frontend & User Experience
- React 19 + Vite SPA with **route-based code splitting** and
  **manual vendor chunking**; lazy-mounted page tabs so a tab's queries
  fire only when first opened.
- Data layer: **SWR-style caching** in `useFetch` (request dedupe +
  background revalidate), Axios **request deduplication**, in-memory
  access token with a **refresh queue**, and `useTransition`-powered
  search debounce.
- Reusable UI kit: accessible **Modal** (focus trap + Escape), **Toast**
  notifications, **ConfirmDialog**, unsaved-changes **navigation guard**,
  a **session-timeout** warning, **DataTable**, **Pagination**,
  **SearchBar**, **FilterDropdown**, **Breadcrumb**, **StatusBadge**,
  **EmptyState**, **SkeletonLoader**, **ErrorBoundary**, **HelpTooltip**,
  and a multi-step **FormWizard**.
- Forms across every module with inline client-side **validation**,
  textarea **character counters**, a password **strength meter**, and
  consistent loading / disabled states inside every action button.
- **Responsive** mobile→tablet→desktop layouts, **dark mode** (Tailwind
  class strategy via `ThemeContext`), contextual **skeleton loaders**,
  lazy images, and **print stylesheets** for profiles and reports.
- **Accessibility** — focus traps, ARIA roles/labels, keyboard
  navigation, a skip-to-content link, and global focus-visible outlines.
- **Cross-browser** normalization for Chrome, Firefox, Safari, and Edge
  (date-input font/height, momentum scroll, Firefox focus/invalid quirks).

### Backend & Platform
- Express MVC backend with `mysql2` connection **pooling** +
  **connection retry / warmup**, a standardized JSON error envelope, and
  a DB-aware **/api/health** endpoint (503 when the database is down).

### Tooling & Docs
- Backend test suites (Jest + Supertest): auth, employees, departments,
  salaries, leave, security, dashboard, full-workflow integration.
- Ordered SQL **migration runner** + seed runner + **mysqldump backup**
  script.
- Documentation: README, API reference, deployment guide, user guide.

### Development timeline

Built over nine one-week sprints (Apr 2 – May 29, 2026) by a two-person
team — Dev A (backend-first) and Dev B (frontend-first):

| Sprint | Dates | Focus |
|--------|-------|-------|
| 1 | Apr 2 – Apr 8 | Project setup, tooling, and database schema |
| 2 | Apr 9 – Apr 15 | Authentication & authorization (JWT, refresh rotation, RBAC) |
| 3 | Apr 16 – Apr 22 | Backend CRUD I — employees, departments, positions |
| 4 | Apr 23 – Apr 29 | Backend CRUD II (salaries, leave, attendance) & first frontend forms |
| 5 | Apr 30 – May 6 | Frontend pages & the dashboard |
| 6 | May 7 – May 13 | Security hardening & advanced features (documents, notifications) |
| 7 | May 14 – May 20 | Frontend performance & optimization (code splitting, caching) |
| 8 | May 21 – May 27 | Testing, accessibility, and bug fixes |
| 9 | May 28 – May 29 | Documentation & v1.0.0 release |

[1.0.0]: https://github.com/eriksalihu/Human-Resource-Management-System-HRMS/releases/tag/v1.0.0
