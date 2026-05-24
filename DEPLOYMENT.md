# Deployment Guide

How to deploy the HR Management System (HRMS) to a production server.

> For local development setup see [`README.md`](./README.md). This guide covers a production deployment.

---

## 1. Server requirements

| Component | Minimum | Notes |
|-----------|---------|-------|
| **OS** | Linux (Ubuntu 22.04+) | Any modern Linux/Unix |
| **Node.js** | v18 LTS+ | `node -v` |
| **MySQL** | 8.0+ | Local or managed (RDS, Cloud SQL, etc.) |
| **Reverse proxy** | nginx / Caddy | TLS termination + static file serving |
| **Process manager** | PM2 / systemd | Keep the API alive + restart on crash |
| **RAM** | 1 GB+ | 512 MB works for a demo |

The MySQL client tools (`mysqldump`) are also required on the API host if you use the backup script.

---

## 2. MySQL setup

```bash
# Create the database + a least-privilege app user
mysql -u root -p <<'SQL'
CREATE DATABASE hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hrms_app'@'%' IDENTIFIED BY 'change-me-strong';
GRANT SELECT, INSERT, UPDATE, DELETE ON hrms.* TO 'hrms_app'@'%';
FLUSH PRIVILEGES;
SQL
```

> Grant `CREATE/ALTER/DROP/INDEX` temporarily while running migrations, then revoke them so the runtime user can only read/write data.

### Run migrations

The repo ships an ordered migration runner that tracks applied files in a `_migrations` table:

```bash
cd backend
node database/migrations/index.js --status     # show what's applied / pending
node database/migrations/index.js --dry-run     # preview the plan
node database/migrations/index.js               # apply all pending migrations
# Roll back one:
node database/migrations/index.js --down=021_create_password_reset_tokens_table.sql
```

(Equivalent npm scripts: `npm run migrate`, `npm run seed` — see §6.)

---

## 3. Backend deployment

```bash
cd backend
npm ci --omit=dev          # production install (no dev deps)
cp .env.example .env       # REQUIRED for production — fill in real values (see §5)
NODE_ENV=production node src/server.js
```

> A `.env` file is optional for local development (sensible defaults are built in), but **required** for production — you must set real JWT secrets, DB credentials, and CORS origins.

### Keep it running (PM2)

```bash
npm install -g pm2
NODE_ENV=production pm2 start src/server.js --name hrms-api
pm2 save && pm2 startup     # restart on reboot
pm2 logs hrms-api           # tail logs
```

The server binds the port immediately and verifies the DB / warms the pool in the background, so it's ready for liveness probes (`GET /api/health`) within milliseconds.

### nginx reverse proxy (TLS + API)

```nginx
server {
  listen 443 ssl http2;
  server_name api.your-domain.com;

  # ssl_certificate / ssl_certificate_key ...

  location / {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;   # required for secure cookies + HTTPS redirect
  }
}
```

The app sets `trust proxy` and reads `X-Forwarded-Proto`, so the secure-cookie + HTTP→HTTPS-redirect logic works behind the proxy.

---

## 4. Frontend deployment

```bash
cd frontend
npm ci
echo "VITE_API_BASE_URL=https://api.your-domain.com/api" > .env.production
npm run build               # outputs to frontend/dist/
```

Serve `frontend/dist/` as static files (nginx, Netlify, Vercel, S3+CloudFront, …). SPA routing requires a catch-all rewrite to `index.html`:

```nginx
server {
  listen 443 ssl http2;
  server_name app.your-domain.com;
  root /var/www/hrms/dist;

  location / {
    try_files $uri $uri/ /index.html;   # SPA fallback
  }
}
```

> The SPA and API may live on different sub-domains — set `CORS_ORIGIN` (backend) to the SPA origin and the cookie SameSite resolves to `None; Secure` automatically in production (see §5).

---

## 5. Environment variables checklist

### Backend (`backend/.env`)

- [ ] `NODE_ENV=production`
- [ ] `PORT` (matches your `proxy_pass`)
- [ ] `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- [ ] `JWT_SECRET` — long random string (`openssl rand -base64 48`)
- [ ] `JWT_REFRESH_SECRET` — a **different** long random string
- [ ] `JWT_EXPIRE` / `JWT_REFRESH_EXPIRE` (optional; defaults `15m` / `7d`)
- [ ] `CORS_ORIGIN` — comma-separated production SPA origin(s)
- [ ] `APP_URL` — public SPA origin (used in password-reset links)
- [ ] `COOKIE_SAMESITE` — only if SPA + API share a site (`lax`)
- [ ] `SMTP_HOST/PORT/USER/PASS/FROM` — for real password-reset emails
- [ ] `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` — if using the backup script

### Frontend (`frontend/.env.production`)

- [ ] `VITE_API_BASE_URL` — full API URL incl. `/api`
- [ ] `VITE_APP_VERSION` — optional release stamp

> **Never** commit `.env` files. Generate fresh JWT secrets per environment.

---

## 6. npm scripts

```bash
# Backend
npm start         # production server
npm run dev       # nodemon (development)
npm run migrate   # apply pending migrations
npm run seed      # populate reference / demo data
npm test          # run the test suite (use a disposable DB_NAME)
npm run backup    # mysqldump → timestamped .sql.gz

# Frontend
npm run build     # production build → dist/
npm run preview   # preview the build locally
```

---

## 7. Backups

```bash
cd backend
npm run backup    # writes BACKUP_DIR/<db>_<timestamp>.sql.gz, prunes old files
```

Schedule it via cron:
```cron
0 2 * * *  cd /var/www/hrms/backend && /usr/bin/npm run backup >> /var/log/hrms-backup.log 2>&1
```

---

## 8. Post-deploy verification

```bash
curl https://api.your-domain.com/api/health
# Expect: { "status": "ok", "database": "connected", "uptime_seconds": ..., "version": "1.0.0" }
```

- [ ] `/api/health` returns `200` + `database: connected`
- [ ] Login works and sets a `Secure; HttpOnly; SameSite` refresh cookie
- [ ] SPA loads and reaches the API (no CORS errors in the console)
- [ ] HTTP requests redirect to HTTPS

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ERR_DB_UNAVAILABLE` / health `503` | DB unreachable / wrong creds | Verify `DB_*`, network/firewall, that MySQL is up |
| CORS error in browser | `CORS_ORIGIN` mismatch | Set it to the exact SPA origin (scheme + host + port) |
| Logged out after ~15 min | Refresh cookie not sent | Behind a different domain → ensure HTTPS so `SameSite=None; Secure` cookies are accepted; confirm `X-Forwarded-Proto` |
| `mysqldump: command not found` | MySQL client tools missing | Install `mysql-client` on the API host |
| SPA deep-link 404 on refresh | Missing SPA fallback | Add the `try_files … /index.html` rewrite |
| Migrations re-run / "table exists" | `_migrations` table missing | Run `node database/migrations/index.js --status` to inspect state |
