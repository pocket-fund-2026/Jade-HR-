from datetime import date

from routers.leave import current_cycle_start


def test_cycle_start_before_and_after_the_23rd():
    assert current_cycle_start(date(2026, 11, 22)) == date(2026, 10, 23)
    assert current_cycle_start(date(2026, 11, 23)) == date(2026, 11, 23)
    assert current_cycle_start(date(2026, 12, 31)) == date(2026, 12, 23)


def test_cycle_start_across_new_year():
    assert current_cycle_start(date(2027, 1, 5)) == date(2026, 12, 23)
    assert current_cycle_start(date(2027, 1, 23)) == date(2027, 1, 23)
