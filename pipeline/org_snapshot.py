#!/usr/bin/env python3
"""Daily org-chart snapshot for the agents. Code only (no model, no tokens).

Pulls the live /api/org-chart (same source as the console's Org Chart page) and writes a trimmed, derived file the agents read:
  /var/lib/jade-hr-pipeline/org.json
Only what agents need to understand structure: id, code, name, designation, department, location, reporting manager, status,
plus derived reports / chain-to-top / department heads. No salaries, dates of birth, contact details or exit dates.
Run via the pipeline ('org_snapshot' job) or by hand: python3 org_snapshot.py [--out PATH]
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from hrpipe import gates  # noqa: E402

OUT = "/var/lib/jade-hr-pipeline/org.json"


def build(raw):
    """Pure: org-chart API payload -> agent-facing structure."""
    people = {}
    for e in raw.get("employees", []):
        if not e.get("active_view", True):
            continue
        people[e["employee_id"]] = {
            "id": e["employee_id"], "code": e.get("employee_code"), "name": (e.get("name") or "").strip(),
            "designation": e.get("designation") or "", "department": e.get("department") or "", "location": e.get("location") or "",
            "manager_id": e.get("reporting_manager_id"), "manager": e.get("reporting_manager") or "", "top": bool(e.get("top_of_org")), "status": e.get("status") or "",
        }
    reports = {}
    for p in people.values():
        if p["manager_id"] in people:
            reports.setdefault(p["manager_id"], []).append(p["id"])
    for pid, p in people.items():
        p["reports"] = reports.get(pid, [])
        chain, cur, seen = [], p, {pid}
        while cur["manager_id"] in people and cur["manager_id"] not in seen:
            cur = people[cur["manager_id"]]; seen.add(cur["id"]); chain.append(cur["id"])
        p["chain"] = chain
    # Department head: among people whose own manager is OUTSIDE the department (or who sit at the top), prefer a leadership title, then
    # the largest team. If nobody has a leadership title or any reports, the pick is marked low confidence: agents must not treat it as fact.
    LEAD = ("head", "director", "lead", "manager", "chief", "ceo", "coo", "cfo", "founder", "vp", "owner")
    def size(pid):
        stack, n = list(people[pid]["reports"]), 0
        while stack:
            c = stack.pop(); n += 1; stack += people[c]["reports"]
        return n
    heads = {}
    for dep in {p["department"] for p in people.values() if p["department"]}:
        members = [p for p in people.values() if p["department"] == dep]
        tops = [p for p in members if p["top"] or p["manager_id"] not in people or people[p["manager_id"]]["department"] != dep] or members
        best = max(tops, key=lambda p: (any(k in p["designation"].lower() for k in LEAD), size(p["id"]), -len(p["chain"])))
        sure = any(k in best["designation"].lower() for k in LEAD) or size(best["id"]) > 0
        heads[dep] = {"id": best["id"], "confident": sure}
    return {"as_of": raw.get("as_of"), "headcount": len(people), "people": list(people.values()), "department_heads": heads,
            "data_gaps": raw.get("data_gaps")}


def main():
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else OUT
    env = gates.load_env()
    import json as _j
    tok = gates._call("/api/auth/login", _j.dumps({"employee_code": env.get("JADE_HR_USER", ""), "password": env.get("JADE_HR_PASS", "")}).encode())
    data = gates._call("/api/org-chart", token=tok.get("access_token") or tok.get("token"))
    snap = build(data)
    if snap["headcount"] < 5:  # verification gate: never replace a good snapshot with an obviously broken one
        print(f"org snapshot refused: only {snap['headcount']} people in response", file=sys.stderr); sys.exit(1)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(out)); os.fchmod(fd, 0o640)
    with os.fdopen(fd, "w") as f:
        json.dump(snap, f, separators=(",", ":"))
    os.replace(tmp, out)  # atomic: readers never see a half-written file
    print(f"org snapshot written: {snap['headcount']} people, {len(snap['department_heads'])} departments, {sum(1 for h in snap['department_heads'].values() if not h['confident'])} heads low-confidence")


if __name__ == "__main__":
    main()
