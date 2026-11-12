import pytest
from fastapi import HTTPException

from routers import letters


def test_sanitizer_strips_active_content_but_keeps_formatting():
    dirty = '<p onclick="x()">Hi <strong>there</strong></p><script>alert(1)</script><a href="javascript:alert(1)">l</a><iframe src="//e"></iframe><style>p{}</style>'
    clean = letters.sanitize_letter_html(dirty)
    assert "<strong>there</strong>" in clean and "<p" in clean
    for bad in ("script", "onclick", "javascript:", "iframe", "<style"):
        assert bad not in clean.lower()


def test_too_long_rejected():
    with pytest.raises(HTTPException) as e:
        letters.sanitize_letter_html("a" * (letters.MAX_LETTER_HTML + 1))
    assert e.value.status_code == 413


class _Q:
    def __init__(self, db): self.db = db
    def select(self, *_): return self
    def update(self, row): self.db.updated = row; return self
    def eq(self, *_): return self
    def maybe_single(self): return self
    def execute(self):
        class R: pass
        r = R(); r.data = self.db.row if self.db.updated is None else [{**self.db.row, **self.db.updated}]; return r


class _DB:
    def __init__(self, row): self.row, self.updated = row, None
    def table(self, _): return _Q(self)


@pytest.mark.parametrize("row", [{"id": "1", "approval_status": "awaiting_approval", "emailed_at": None}, {"id": "1", "approval_status": None, "emailed_at": "2026-11-12"}])
def test_sent_letters_cannot_be_edited(monkeypatch, row):
    monkeypatch.setattr(letters, "supabase", _DB(row))
    with pytest.raises(HTTPException) as e:
        letters.edit_generated_letter("1", letters.LetterBodyEdit(rendered_body="<p>x</p>"), {"id": "u"})
    assert e.value.status_code == 409
