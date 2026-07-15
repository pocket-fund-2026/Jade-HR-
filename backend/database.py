import httpx
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL

# Vercel reuses warm function containers across invocations, and Supabase's
# edge sometimes closes an idle keep-alive connection right as we try to
# reuse it — surfaces as httpx.RemoteProtocolError("Server disconnected").
# postgrest-py's own retry (send_with_retry) only retries HTTP 503/520
# responses, never a connection-level error like this one, so it always
# propagated straight through as a 500. httpx's transport-level `retries`
# is built for exactly this case: on a connection error it opens a fresh
# connection and retries once, transparently — no protocol/timing changes.
supabase = create_client(
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    options=SyncClientOptions(httpx_client=httpx.Client(transport=httpx.HTTPTransport(retries=1))),
)


def maybe_single_data(resp):
    """`.maybe_single().execute()` returns bare `None` (not a response object
    with `.data = None`) whenever zero rows match — accessing `.data` on that
    directly raises AttributeError instead of behaving like a graceful
    not-found. Always route a maybe_single() result through this."""
    return resp.data if resp else None
