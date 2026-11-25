from unittest.mock import MagicMock, patch

import routers.market_visits as mv


def _fake_supabase(rows):
    sb = MagicMock()
    q = sb.table.return_value.select.return_value
    q.in_.return_value.gte.return_value.lt.return_value.order.return_value.execute.return_value.data = rows
    return sb


def test_movement_groups_by_employee_and_day():
    rows = [
        {"employee_id": "e1", "captured_at": "2026-11-24T05:00:00", "visit_type": "check_in", "place": "Store A", "place_type": "store"},
        {"employee_id": "e1", "captured_at": "2026-11-24T11:00:00", "visit_type": "check_out", "place": "Store A", "place_type": "store"},
        {"employee_id": "e2", "captured_at": "2026-11-25T05:00:00", "visit_type": "check_in"},
    ]
    with patch.object(mv, "supabase", _fake_supabase(rows)):
        out = mv.movement_for(["e1", "e2"], ["2026-11-24", "2026-11-25"])
    assert [m["visit_type"] for m in out[("e1", "2026-11-24")]] == ["check_in", "check_out"]
    assert out[("e2", "2026-11-25")][0]["place_type"] == "market"


def test_movement_failure_is_swallowed():
    sb = MagicMock()
    sb.table.side_effect = RuntimeError("db down")
    with patch.object(mv, "supabase", sb):
        assert mv.movement_for(["e1"], ["2026-11-24"]) == {}


def test_attach_movement_sets_empty_list_when_none():
    rows = [{"employee_id": "e1", "date": "2026-11-24"}]
    with patch.object(mv, "movement_for", return_value={}):
        mv.attach_movement(rows)
    assert rows[0]["movement"] == []
