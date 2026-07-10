# JADE HR

Payroll & attendance system for JADE's Madhu Estate (Mumbai) staff, built on biometric punch data.

Two interfaces:
- **Admin** (`/admin`) — manage employees & salary structure, view attendance/OT/payroll for everyone, biometric sync status.
- **Employee** (`/employee`) — self-service view of own attendance and payslip.

## Roles & access control

Three roles, stored on `hr_employees.role`:
- **accounts** — full access to everything in `/admin`, including the **Team Access** page, which is the only place that controls what `hr` can see.
- **hr** — day-to-day people ops (employees, disputes, leave, biometric sync) on by default; salary figures and the Payroll & OT section are off by default. Only an `accounts` user can flip these on, and only `accounts` can promote someone into the `hr` or `accounts` role — `hr` can never self-escalate.
- **employee** — self-service only.

Toggles live in `hr_permissions` (seeded by `sql/002_hr_access_control.sql` / `sql/schema.sql`) and are enforced both in the API (`backend/auth.py`'s `require_permission`) and the admin UI (nav items, page routes, and salary fields all hide/disable per-permission). If you're upgrading an existing deployment, run `sql/002_hr_access_control.sql` once in the Supabase SQL editor — it migrates any existing `role = 'admin'` accounts to `accounts` so nobody is locked out.

## OT formula

```
Total Salary   = Basic + HRA + Conveyance
Per Day Salary = Total Salary / Days in Month
Per Hour Salary = Per Day Salary / Standard Hours per Day  (default 8)
OT Amount      = Per Hour Salary x Total OT Hours (worked hours beyond the standard shift, summed for the month)
```

See `backend/payroll.py` for the implementation.

## Stack

- Backend: FastAPI + `supabase-py`, deployed as a Vercel Python serverless function (`api/index.py` -> `backend/main.py`)
- Frontend: React + Vite + Tailwind, deployed as the same Vercel project's static output
- DB/Auth: Supabase Postgres (see `sql/schema.sql`)
- Biometric ingest: `biometric_sync.py`, run via cron wherever it has network access to the Madhu Estate SmartOffice device — pulls punch logs and pushes them to `/api/biometric/ingest`

## Local setup

```
# 1. Supabase: paste sql/schema.sql into the SQL editor of a fresh project

# 2. Backend
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_SERVICE_KEY / JWT_SECRET
uvicorn main:app --reload --port 8000

# 3. Frontend
cd frontend
npm install
npm run dev   # http://localhost:5210, proxies /api to localhost:8000
```

Visit `/setup` once to create the first account, as `accounts` (only works while `hr_employees` is empty).

## Biometric sync

`biometric_sync.py` needs, at minimum:
- `SMARTOFFICE_URL` — the Madhu Estate SmartOffice device/server base URL (not yet known — get from whoever manages that device, same as the Kolkata one jade-tts already syncs from)
- `JADE_HR_USER` / `JADE_HR_PASS` — a dedicated service account in jade-hr (role `accounts` or `hr`), created just for this script (don't reuse a human login)

`SMARTOFFICE_API_KEY` already defaults to the Madhu Estate key. Once `SMARTOFFICE_URL` is known, schedule it via cron (same pattern as jade-tts's `/etc/cron.d/jade-tts-biometric`):

```
0 23 * * *  root  python3 /root/jade-hr/biometric_sync.py
0  7 * * *  root  python3 /root/jade-hr/biometric_sync.py
```
