from datetime import time

from payroll import _slot_times
from routers.employee_profile import _slot_label


def test_label_roundtrips_through_payroll_parser():
    for start, end in [(time(10, 30), time(19, 30)), (time(0, 15), time(9, 0)), (time(12, 0), time(20, 45)), (time(9, 5), time(18, 0))]:
        label = _slot_label(start, end)
        assert _slot_times(label) == (start, end), label


def test_label_format():
    assert _slot_label(time(10, 30), time(19, 30)) == "10:30 AM – 7:30 PM"
    assert _slot_label(time(12, 0), time(23, 0)) == "12:00 PM – 11:00 PM"
