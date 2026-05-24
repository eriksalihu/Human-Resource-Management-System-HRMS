# HRMS API Documentation

Complete reference for the HR Management System REST API.

- **Base URL (dev):** `http://localhost:5001/api`
- **Content type:** `application/json` (except document upload → `multipart/form-data`)
- **Auth:** JWT Bearer access token in the `Authorization` header; refresh token in an httpOnly cookie.

---

## Authentication model

1. **Login / register** issues a short-lived **access token** (default 15 min) in the JSON body and sets a long-lived **refresh token** (default 7 days) as an httpOnly cookie.
2. Send the access token on every protected request:
   ```
   Authorization: Bearer <accessToken>
   ```
3. When the access token expires (`401` + `code: ERR_TOKEN_EXPIRED`), call `POST /auth/refresh-token` (the cookie is sent automatically) to get a new access token. Refresh tokens **rotate** on every use; replaying a spent token triggers family revocation (`ERR_REFRESH_REUSE_DETECTED`).

### Roles

`Admin`, `HR Manager`, `Department Manager`, `Employee`. Endpoints note the roles permitted; anything stricter than "any authenticated user" is called out.

---

## Standard response envelopes

**Success**
```json
{ "success": true, "data": { /* ... */ }, "pagination": { /* list endpoints */ }, "message": "optional" }
```

**Error** (every error, uniformly)
```json
{
  "success": false,
  "message": "Human-readable explanation",
  "statusCode": 400,
  "errors": [{ "field": "email", "message": "..." }],
  "code": "ERR_VALIDATION"
}
```
`errors` appears on validation failures (422); `code` is a machine-readable string for client branching.

**Pagination** (list endpoints)
```json
{ "currentPage": 1, "perPage": 10, "total": 134, "totalPages": 14, "hasNextPage": true, "hasPrevPage": false }
```
Query params: `?page=1&limit=10&sortBy=<col>&sortOrder=ASC|DESC&search=<term>`.

---

## Error codes

| Code | Status | Meaning |
|------|--------|---------|
| `ERR_VALIDATION` | 422 | Request failed field validation (see `errors[]`) |
| `ERR_TOKEN_EXPIRED` | 401 | Access token expired — refresh and retry |
| `ERR_TOKEN_INVALID` | 401 | Missing / malformed / bad-signature token |
| `ERR_REFRESH_REUSE_DETECTED` | 401 | Spent refresh token replayed — session family revoked |
| `ERR_ACCOUNT_LOCKED` | 423 | Too many failed logins — temporary lockout |
| `ERR_RATE_LIMITED` | 429 | Rate limit hit — see `retry_after_seconds` |
| `ERR_RESET_TOKEN_INVALID` | 400 | Password-reset link invalid / expired / used |
| `ERR_DUPLICATE` | 409 | Unique constraint violated |
| `ERR_FK_CONSTRAINT` | 400/409 | Referenced row missing / still referenced |
| `ERR_DB_UNAVAILABLE` | 503 | Database temporarily unreachable |
| `ERR_NOT_FOUND` | 404 | No route matched |

---

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | Public (3/hr) | Create an account |
| POST | `/login` | Public (5/15min) | Authenticate, issue tokens |
| POST | `/logout` | Public | Revoke refresh token, clear cookie |
| POST | `/refresh-token` | Cookie (10/min) | Rotate refresh token, new access token |
| POST | `/forgot-password` | Public (3/hr) | Email a reset link (neutral response) |
| POST | `/reset-password` | Public (3/hr) | Set a new password via token |
| GET | `/profile` | Bearer | Authenticated user + roles |

**Register**
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@hrms.local","password":"Test1234","first_name":"Ada","last_name":"Lovelace"}'
```

**Login** (capture the refresh cookie)
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"email":"ada@hrms.local","password":"Test1234"}'
# → { "success": true, "data": { "user": {...}, "accessToken": "eyJ..." } }
```

**Reset password**
```bash
curl -X POST http://localhost:5001/api/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"<from-email-link>","password":"NewPass123"}'
```

---

## Employees — `/api/employees`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR, Dept Mgr | List (paginated, searchable, filterable) |
| GET | `/me` | Any | Current user's employee record |
| GET | `/:id` | Admin, HR, Dept Mgr | One employee |
| GET | `/export/csv` | Admin, HR | Stream the roster as CSV |
| GET | `/manager/:managerId/subordinates` | Admin, HR, Dept Mgr | Direct reports |
| POST | `/` | Admin, HR | Create |
| PUT | `/:id` | Admin, HR | Update |
| DELETE | `/:id` | Admin, HR | Terminate |

Filters: `department_id`, `position_id`, `statusi`, `lloji_kontrates`, `search`. Sortable by `id`, `numri_punonjesit`, `data_punesimit`, `statusi`, `lloji_kontrates`, `created_at`, plus joined `first_name`, `last_name`, `email`, `department_emertimi`, `position_emertimi`.

```bash
curl 'http://localhost:5001/api/employees?department_id=2&statusi=active&page=1&limit=10' \
  -H 'Authorization: Bearer <token>'
```

---

## Departments — `/api/departments`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Any | List |
| GET | `/:id` | Any | One department |
| POST | `/` | Admin, HR | Create |
| PUT | `/:id` | Admin, HR | Update |
| DELETE | `/:id` | Admin | Delete |

## Positions — `/api/positions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Any | List |
| GET | `/:id` | Any | One position |
| GET | `/department/:departmentId` | Any | Positions in a department |
| POST | `/` | Admin, HR | Create |
| PUT | `/:id` | Admin, HR | Update |
| DELETE | `/:id` | Admin | Delete |

---

## Salaries — `/api/salaries`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR | List |
| GET | `/:id` | Admin, HR | One record |
| GET | `/employee/:employeeId` | Admin, HR, Dept Mgr | One employee's history |
| GET | `/payroll/summary` | Admin, HR | Period totals (`?muaji&viti[&department_id]`) |
| GET | `/payroll/report` | Admin, HR | Department breakdown + YoY comparison |
| POST | `/` | Admin, HR | Create (net pay auto-computed) |
| POST | `/bulk` | Admin, HR | Generate month-end payroll |
| PUT | `/:id` | Admin, HR | Update (net re-computed) |
| DELETE | `/:id` | Admin | Delete |

```bash
curl -X POST http://localhost:5001/api/salaries \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"employee_id":12,"paga_baze":1200,"bonuse":150,"zbritje":25,"muaji":5,"viti":2026}'
```

---

## Leave requests — `/api/leave-requests`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR, Dept Mgr | List |
| GET | `/me` | Any | Own requests + balance |
| GET | `/pending` | Admin, HR, Dept Mgr | Pending queue |
| GET | `/:id` | Admin, HR, Dept Mgr | One request |
| POST | `/` | Any (HR/Admin on behalf) | Create (overlap-checked) |
| PUT | `/:id` | Owner / HR / Admin | Update a pending request |
| PUT | `/:id/approve` | Admin, HR, Dept Mgr | Approve |
| PUT | `/:id/reject` | Admin, HR, Dept Mgr | Reject |
| PUT | `/:id/cancel` | Owner / HR / Admin | Cancel |

---

## Attendance — `/api/attendances`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR, Dept Mgr | List |
| GET | `/me` | Any | Own attendance |
| GET | `/:id` | Admin, HR, Dept Mgr | One entry |
| GET | `/department/:departmentId` | Admin, HR, Dept Mgr | Department view |
| GET | `/report/monthly` | Admin, HR | Monthly report (`?format=csv` for export) |
| POST | `/` | Admin, HR | Create entry |
| POST | `/check-in` | Any | Self check-in |
| POST | `/check-out` | Any | Self check-out |
| PUT | `/:id` | Admin, HR | Update |
| DELETE | `/:id` | Admin, HR | Delete |

---

## Performance reviews — `/api/performance-reviews`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR, Dept Mgr | List |
| GET | `/me` | Any | Reviews about me + average |
| GET | `/to-complete` | Admin, HR, Dept Mgr | Reviewer's pending queue |
| GET | `/statistics` | Admin, HR, Dept Mgr | Rating distribution |
| GET | `/team` | Admin, HR, Dept Mgr | Team analytics (top/bottom, gaps) |
| GET | `/:id` | Admin, HR, Dept Mgr | One review |
| POST | `/` | Admin, HR, Dept Mgr | Create |
| PUT | `/:id` | Author / HR / Admin | Update |
| DELETE | `/:id` | Admin, HR | Delete |

---

## Trainings — `/api/trainings` & `/api/training-participants`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Any | List |
| GET | `/my` | Any | My enrollments |
| GET | `/upcoming` `/ongoing` `/calendar` | Any | Filtered views |
| GET | `/:id` | Any | One training |
| GET | `/:id/participants` | Admin, HR, Dept Mgr | Roster |
| POST | `/` | Admin, HR | Create |
| POST | `/:id/enroll` | Any | Enroll (self or, for HR, others) |
| POST | `/:id/withdraw` | Any | Withdraw |
| POST | `/participants/:participantId/rating` | Any | Rate a completed training |
| PUT | `/:id` | Admin, HR | Update |
| PUT | `/participants/:participantId/status` | Admin, HR | Update enrollment status |
| DELETE | `/:id` | Admin, HR | Delete |

---

## Documents — `/api/documents`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR | List |
| GET | `/me` | Any | Own documents |
| GET | `/employee/:employeeId` | Admin, HR | Employee's documents |
| GET | `/expiring` | Admin, HR | Soon-to-expire documents |
| GET | `/:id` | Owner / HR / Admin | Metadata |
| GET | `/:id/download` | Owner / HR / Admin | Download the file |
| POST | `/` | Admin, HR | Upload (`multipart/form-data`) |
| PUT | `/:id` | Admin, HR | Update metadata |
| DELETE | `/:id` | Admin, HR | Delete |

Upload rules: `pdf, doc, docx, jpg, png` only, ≤ 5 MB, filename sanitized.
```bash
curl -X POST http://localhost:5001/api/documents \
  -H 'Authorization: Bearer <token>' \
  -F 'file=@contract.pdf' -F 'employee_id=12' -F 'lloji=contract' -F 'emertimi=Employment Contract'
```

---

## Notifications — `/api/notifications`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me` | Any | Own notifications |
| GET | `/unread-count` | Any | Unread badge count |
| PUT | `/:id/read` | Owner | Mark one read |
| PUT | `/read-all` | Owner | Mark all read |
| DELETE | `/:id` | Owner | Delete one |

## Dashboard — `/api/dashboard`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/overview` | Any | KPI counts (+ payroll for HR/Admin) |
| GET | `/charts` | Any | Chart datasets (`?trend_days&leave_days`) |
| GET | `/recent-activities` | Any | Audit-log activity feed (`?limit`) |

## Users — `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin | List accounts |
| GET | `/:id` | Admin | One account |
| PUT | `/profile` | Any | Update own profile |
| POST | `/` | Admin | Create account |
| PUT | `/:id` | Admin | Update account |
| DELETE | `/:id` | Admin | Delete account |

## Audit logs — `/api/audit-logs`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin, HR | All mutation events |
| GET | `/entity/:entity/:entityId` | Admin, HR | Events for one record |

## Health — `/api/health`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | Status, DB connectivity, uptime, version, memory (503 when DB down) |

```bash
curl http://localhost:5001/api/health
# → { "status": "ok", "database": "connected", "uptime_seconds": 1284, "version": "1.0.0", ... }
```
