from supabase import create_client

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def maybe_single_data(resp):
    """`.maybe_single().execute()` returns bare `None` (not a response object
    with `.data = None`) whenever zero rows match — accessing `.data` on that
    directly raises AttributeError instead of behaving like a graceful
    not-found. Always route a maybe_single() result through this."""
    return resp.data if resp else None
