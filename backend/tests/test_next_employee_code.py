from routers import onboarding


class _Q:
    def __init__(self, codes): self.codes = codes
    def table(self, _): return self
    def select(self, _): return self
    def execute(self):
        class R: pass
        r = R(); r.data = [{"employee_code": c} for c in self.codes]; return r


def _next(monkeypatch, codes):
    monkeypatch.setattr(onboarding, "supabase", _Q(codes))
    return onboarding._next_employee_code()


def test_continues_after_zoho_and_ignores_outliers(monkeypatch):
    assert _next(monkeypatch, ["14850", "14699", "70464", "225427", "22004"]) == "14851"


def test_stray_codes_in_band_do_not_skew_sequence(monkeypatch):
    # 16041/16261/16262 are biometric stubs / test rows that used to push the next code to 16263
    assert _next(monkeypatch, ["14850", "16041", "16261", "16262"]) == "14851"
    assert _next(monkeypatch, ["14850", "14851", "14852", "16262"]) == "14853"


def test_floor_and_increment(monkeypatch):
    assert _next(monkeypatch, ["14600"]) == "14851"
    assert _next(monkeypatch, ["14851", "14852", "abc"]) == "14853"


def test_locations_fallback_includes_hq_with_full_address(monkeypatch):
    class Boom:
        def table(self, _): raise RuntimeError("no table")
    monkeypatch.setattr(onboarding, "supabase", Boom())
    locs = onboarding.public_locations()
    hq = [l for l in locs if l["is_hq"]]
    assert len(hq) == 1 and "Lower Parel" in hq[0]["address"]
