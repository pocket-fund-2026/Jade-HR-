#!/usr/bin/env python3
"""One-time: turn a Google OAuth client + tina@jadecouture.com consent into a refresh token (scope gmail.send only).
  python3 ops/gmail_auth.py url      <client_id>
  python3 ops/gmail_auth.py exchange <client_id> <client_secret> '<pasted http://localhost... URL or code>'
The browser shows "can't reach localhost" after consent; that is expected, copy the full address-bar URL.
Prints GMAIL_* lines; it never writes them anywhere."""
import json, sys, urllib.parse, urllib.request

REDIRECT = "http://localhost:1"
SCOPE = "https://www.googleapis.com/auth/gmail.send"
a = sys.argv[1:]
if len(a) == 2 and a[0] == "url":
    q = urllib.parse.urlencode({"client_id": a[1], "redirect_uri": REDIRECT, "response_type": "code", "scope": SCOPE,
                                "access_type": "offline", "prompt": "select_account consent", "login_hint": "tina@jadecouture.com"})
    print("https://accounts.google.com/o/oauth2/v2/auth?" + q)
elif len(a) == 4 and a[0] == "exchange":
    code = urllib.parse.parse_qs(urllib.parse.urlparse(a[3]).query)["code"][0] if "code=" in a[3] else a[3]
    data = urllib.parse.urlencode({"code": code, "client_id": a[1], "client_secret": a[2], "redirect_uri": REDIRECT, "grant_type": "authorization_code"}).encode()
    try:
        j = json.loads(urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=data), timeout=20).read())
    except urllib.error.HTTPError as e:
        sys.exit("Google said: " + e.read().decode()[:200])
    if not j.get("refresh_token"):
        sys.exit("No refresh token: " + json.dumps(j)[:200])
    print(f"GMAIL_CLIENT_ID={a[1]}\nGMAIL_CLIENT_SECRET={a[2]}\nGMAIL_REFRESH_TOKEN={j['refresh_token']}")
else:
    sys.exit(__doc__)
