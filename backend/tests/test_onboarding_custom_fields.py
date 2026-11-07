import pytest
from fastapi import HTTPException

from routers.onboarding import _validated_custom_values

FIELDS = [
    {"field_key": "blood_group", "label": "Blood group", "field_type": "select", "options": ["A+", "B+"], "required": True},
    {"field_key": "notes", "label": "Notes", "field_type": "textarea", "options": [], "required": False},
    {"field_key": "agree", "label": "Agree", "field_type": "checkbox", "options": [], "required": True},
]


def test_valid_answers_kept_and_unknown_keys_dropped():
    out = _validated_custom_values({"blood_group": "A+", "agree": True, "junk": "x"}, FIELDS)
    assert out == {"blood_group": "A+", "notes": "", "agree": True}


def test_required_missing_lists_labels():
    with pytest.raises(HTTPException) as e:
        _validated_custom_values({}, FIELDS)
    assert "Blood group" in e.value.detail and "Agree" in e.value.detail


def test_select_rejects_unlisted_choice():
    with pytest.raises(HTTPException):
        _validated_custom_values({"blood_group": "Z", "agree": True}, FIELDS)
