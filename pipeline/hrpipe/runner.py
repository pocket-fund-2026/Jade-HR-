"""Executes one job command: environment from the sync env file, hard timeout, output appended to the job's existing log
(so old log paths and the markers other tools read keep working), verified against success_re."""
import os
import re
import subprocess
import time

from . import config


def execute(cmd, env, timeout_s, success_re, log_path):
    """Returns (status, exit_code, tail). status: ok | failed | timeout."""
    full_env = {**os.environ, **env}
    stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    try:
        p = subprocess.run(cmd, env=full_env, capture_output=True, text=True, timeout=timeout_s, cwd=config.ROOT)
        out, rc, status = (p.stdout or "") + (p.stderr or ""), p.returncode, None
    except subprocess.TimeoutExpired as e:
        out = ((e.stdout or b"").decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")) + f"\n[pipeline] timed out after {timeout_s}s"
        rc, status = None, "timeout"
    except Exception as e:  # could not even start
        out, rc, status = f"[pipeline] could not start: {type(e).__name__}: {e}", None, "failed"
    if status is None:
        if rc != 0:
            status = "failed"
        elif success_re and not re.search(success_re, out):
            status = "failed"
            out += f"\n[pipeline] exit 0 but success marker /{success_re}/ not found"
        else:
            status = "ok"
    try:
        with open(log_path, "a") as f:
            f.write(f"[{stamp}] [pipeline] {' '.join(os.path.basename(c) for c in cmd[1:])} -> {status}\n{out}\n")
    except OSError:
        pass
    return status, rc, out.strip()[-600:]
