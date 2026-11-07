import os

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "x")

from routers.letters import _substitute, _tokens_in, place_clauses, render_clauses

BODY = '<p>Dear {{name}}</p><div class="lt-sign">sign</div>'


def test_clauses_go_above_signature_and_are_escaped():
    html = _substitute(place_clauses(BODY, render_clauses([{"title": "Non-compete", "body": "No <b>rivals</b>\nfor 1 year"}])), {"name": "A"})
    assert html.index("Additional Terms") < html.index('class="lt-sign"')
    assert "&lt;b&gt;rivals" in html and "<b>rivals" not in html
    assert "<br>for 1 year" in html


def test_no_clauses_leaves_letter_unchanged():
    assert place_clauses(BODY, render_clauses([])) == BODY
    assert render_clauses([{"title": " ", "body": ""}]) == ""


def test_explicit_clauses_token_and_not_a_form_field():
    assert place_clauses("a{{ clauses }}b", "X") == "aXb"
    assert place_clauses("a{{clauses}}b", "") == "ab"
    assert _tokens_in("{{clauses}}{{name}}") == ["name"]
