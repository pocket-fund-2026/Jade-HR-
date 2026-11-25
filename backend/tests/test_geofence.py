import geofence as geo

BALLARD = {"id": "f1", "name": "Ballard Estate, Mint Road", "latitude": 18.9340, "longitude": 72.8400,
           "radius_m": 100, "center_confirmed": True, "is_active": True}


def test_haversine_known_distance():
    # ~0.001 degree of latitude is about 111 m
    assert 105 < geo.haversine_m(18.9340, 72.8400, 18.9350, 72.8400) < 117


def test_verified_inside_100m():
    assert geo.evaluate(BALLARD, 18.93405, 72.84005, 8)["state"] == "verified"


def test_outside_beyond_100m():
    r = geo.evaluate(BALLARD, 18.9400, 72.8400, 10)
    assert r["state"] == "outside" and r["distance_m"] > 600


def test_imprecise_when_gps_error_could_explain_it():
    r = geo.evaluate(BALLARD, 18.9350, 72.8400, 60)  # ~111 m away, +-60 m
    assert r["state"] == "imprecise"


def test_unconfirmed_centre_never_enforces():
    f = {**BALLARD, "center_confirmed": False}
    assert geo.evaluate(f, 19.5, 73.5, 5)["state"] == "unconfirmed"


def test_match_fence_by_partial_name():
    assert geo.match_fence("Ballard Estate", [BALLARD]) is BALLARD
    assert geo.match_fence("ballard estate, mint road", [BALLARD]) is BALLARD
    assert geo.match_fence("Pedder Road", [BALLARD]) is None
    assert geo.match_fence("", [BALLARD]) is None
