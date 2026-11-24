from config import serial_allowed


def test_kolkata_device_only_passes_named_jade_hr_employee():
    assert serial_allowed("CK5O223960664", "14817") is True
    # Kolkata's "1" is a different person from Ahmedabad's "1": still rejected.
    assert serial_allowed("CK5O223960664", "1") is False
    assert serial_allowed("CK5O223960664", "99999") is False


def test_regular_devices_unaffected():
    assert serial_allowed("C2696422DF0E2832", "1") is True
