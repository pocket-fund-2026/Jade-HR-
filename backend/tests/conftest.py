import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# config.py reads these via os.environ[...] (not .get) at import time.
# Dummy values only — these tests never touch Supabase or issue real JWTs.
os.environ.setdefault("SUPABASE_URL", "http://localhost/test")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
