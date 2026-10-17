# Development Setup Guide

## 1. Prerequisites

Ensure your development environment meets the following specifications:
- **Node.js**: `v22.x` LTS or later
- **npm**: `10.x` or later
- **Docker & Docker Compose**: Docker Engine `24.x+` (Docker Desktop on Windows/macOS)
- **Git**: `2.40+`

Verify your tools via terminal:
```powershell
node --version
npm --version
docker --version
docker compose version
```

---

## 2. Environment Configuration

1. Copy the template `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Verify that local ports (PostgreSQL `5432`, Redis `6379`, MinIO `9000` / `9001`) are available on your machine.

---

## 3. Starting Local Backing Services

Start PostgreSQL, Redis, and MinIO in the background:
```powershell
docker compose up -d
```

Verify service health:
```powershell
docker compose ps
```

All services should report `healthy` or `running`:
- **PostgreSQL**: `localhost:5432` (`qrprint_user` / `qrprint_secure_pass` / `qrprint_db`)
- **Redis**: `localhost:6379`
- **MinIO S3**: `http://localhost:9000` (API) & `http://localhost:9001` (Web Console)
  - Default credentials: `minioadmin` / `minioadmin`
  - Bucket `qrprint-documents` is provisioned automatically by `minio-init`.

To stop the services:
```powershell
docker compose down
```

---

## 4. Database Migrations & Seeds

When database changes are implemented:
```powershell
# Generate migration files from Drizzle schema
npm run db:generate

# Apply pending migrations to the local database
npm run db:migrate

# Seed demo merchant, shop, rate cards, and paper catalog
npm run db:seed
```

---

## 5. Running the Application Locally

```powershell
# Run the backend API in development mode
npm run dev

# Run the frontend web app (in apps/web or frontend workspace)
npm run dev:frontend
```

---

## 6. Running Verification & Quality Gates

Run the automated checks before committing any change:

```powershell
# 1. Lint and format checks
npm run lint
npm run format:check

# 2. TypeScript type check across the workspace
npm run typecheck

# 3. Unit and integration test suites
npm run test

# 4. Multi-tenant isolation test suite
npm run test:tenant-isolation
```
