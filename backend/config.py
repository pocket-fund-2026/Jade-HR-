import os
from datetime import timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

# All Jade locations are in India. SmartOffice punch timestamps and admin
# time-entry are both IST wall-clock — stored converted to true UTC in the
# DB, converted back for display.
IST = timezone(timedelta(hours=5, minutes=30))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

# Used by biometric_sync.py to authenticate against /api/biometric/ingest
BIOMETRIC_SYNC_SECRET = os.environ.get("BIOMETRIC_SYNC_SECRET", "")

# SmartOffice device serial -> Jade location. Identified by cross-referencing
# employee codes per department (from the SmartOffice employee-master export)
# against which serial their punches actually land on.
SERIAL_TO_LOCATION = {
    "C2696422DF0E2832": "Madhu Estate, Mumbai",
    "C2684450831C3B32": "Pedder Road, Mumbai",
    "C26238441B160C2E": "Mehrauli (Ambawatta), Delhi",
    "C2600831C32B1034": "Emporio, Delhi",
    "C2625841D724172A": "Ahmedabad",
}

# Kolkata's team was removed from jade-hr on 2026-07-11 — its device serial
# must never ingest punches again (auto-provisioning would silently recreate
# blank employee stubs the next time this serial's data syncs). Enforced in
# routers/biometric.py's ingest() regardless of what biometric_sync.py sends.
EXCLUDED_SERIALS = {"CK5O223960664"}
