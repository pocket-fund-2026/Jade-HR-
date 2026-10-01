"""HTML email wrapper for a generated letter (routers/letters.py email
endpoint). Email clients ignore external CSS and most of them strip
<style> blocks from <body>, so the lt-* letter system from
frontend/src/index.css is mirrored here as a <head> <style> block (Gmail,
Outlook web and Apple Mail all honour that) with the structural wrapper
styled inline. Keep in step with index.css's Letters section."""

import html as html_lib

COMPANY_NAME = "JADE Lifestyles India"
OFFICE_ADDRESS = "101 Raheja Xion, Dr. Ambedkar Road, Byculla (East), Mumbai 400027, India"
HR_CONTACT = "team.hr@jadecouture.com"
LOGO_URL = "https://jade-hr.vercel.app/jade-logo.png"

LETTER_CSS = """
.letter-doc{font-family:'IBM Plex Sans',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#1B1B18}
.letter-doc p,.letter-doc ol,.letter-doc ul{margin:0 0 0.9em}
.letter-doc ol,.letter-doc ul{padding-left:1.4em}
.letter-doc li{margin-bottom:0.35em}
.letter-doc table{width:100%;border-collapse:collapse;margin:0 0 1em;font-size:13px}
.letter-doc td,.letter-doc th{border:1px solid #d3dbd8;padding:7px 10px;text-align:left;vertical-align:top}
.letter-doc th{background:#EAF4EF;color:#16302A;font-weight:600;font-size:11px;letter-spacing:0.04em;text-transform:uppercase}
.letter-doc .lt-dateline{font-size:12.5px;color:#555;margin-bottom:1.6em}
.letter-doc .lt-dateline span{display:inline-block;margin-right:24px}
.letter-doc .lt-confidential{font-size:10.5px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#A13D2E}
.letter-doc .lt-to{margin-bottom:1.4em}
.letter-doc .lt-label{display:block;font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#888;margin-bottom:2px}
.letter-doc .lt-subject{margin:0 0 1.4em;padding:8px 0 8px 12px;border-left:3px solid #2F7A5E;background:#EAF4EF;font-weight:600;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#16302A}
.letter-doc .lt-heading{font-family:Georgia,serif;font-size:15px;font-weight:600;color:#16302A;margin:1.5em 0 0.5em;padding-bottom:4px;border-bottom:1px solid #dfe5e2}
.letter-doc .lt-title{font-family:Georgia,serif;font-size:20px;font-weight:600;text-align:center;color:#16302A}
.letter-doc table.lt-details{border-top:2px solid #16302A}
.letter-doc table.lt-details td{border:0;border-bottom:1px solid #e6ebe9;padding:7px 4px}
.letter-doc table.lt-details td:first-child{width:38%;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#777}
.letter-doc table.lt-details td:last-child{font-weight:600}
.letter-doc table.lt-money td:last-child,.letter-doc table.lt-money th:last-child{text-align:right;white-space:nowrap}
.letter-doc tr.lt-group td{background:#FAF7F0;font-weight:600}
.letter-doc tr.lt-total td{border-top:2px solid #16302A;font-weight:700;background:#EAF4EF}
.letter-doc .lt-callout{margin:0 0 1em;padding:10px 14px;border-left:3px solid #A13D2E;background:#FBEEE9}
.letter-doc .lt-note{font-size:12px;color:#666}
.letter-doc .lt-sign{margin-top:2em}
.letter-doc .lt-sign-space{height:40px}
.letter-doc .lt-sign-name{display:inline-block;min-width:220px;border-top:1px solid #1B1B18;padding-top:6px}
.letter-doc .lt-sign-meta{color:#666;font-size:12.5px}
.letter-doc .lt-accept{margin-top:2.2em;padding:14px 16px;border:1px dashed #8aa39a}
.letter-doc .lt-accept td{border:0;padding:22px 8px 4px 0}
.letter-doc .lt-accept td span{display:block;border-top:1px solid #1B1B18;padding-top:4px;font-size:11px;color:#777}
.letter-doc .lt-lines{height:64px;border-bottom:1px solid #d3dbd8;margin-bottom:1em}
"""


def build_letter_email_html(rendered_body: str, cover_message: str, title: str) -> str:
    """Full HTML document: a short cover note from HR, then the letter on
    its letterhead. rendered_body is already token-substituted and
    escape-safe (routers/letters._substitute); cover_message is plain text
    typed by HR and is escaped here."""
    cover = "".join(
        f"<p style=\"margin:0 0 0.8em\">{html_lib.escape(line)}</p>"
        for line in cover_message.split("\n") if line.strip()
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html_lib.escape(title)}</title><style>{LETTER_CSS}</style></head>
<body style="margin:0;padding:0;background:#EFE9DA;">
<div style="max-width:720px;margin:0 auto;padding:24px 12px;">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1B1B18;padding:0 6px 18px;">{cover}</div>
  <div style="background:#ffffff;border:1px solid #e2dccb;padding:36px 40px;">
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px;border-bottom:2px solid #16302A;">
      <tr>
        <td style="border:0;padding:0 0 14px;width:52px;vertical-align:middle;"><div style="width:46px;height:46px;background:#16302A;border-radius:2px;text-align:center;"><img src="{LOGO_URL}" alt="JADE" width="34" height="34" style="display:inline-block;margin-top:6px;"></div></td>
        <td style="border:0;padding:0 0 14px 10px;vertical-align:middle;">
          <div style="font-family:Georgia,serif;font-size:19px;color:#16302A;letter-spacing:0.02em;">{COMPANY_NAME}</div>
        </td>
        <td style="border:0;padding:0 0 14px;text-align:right;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#666;">
          {OFFICE_ADDRESS}<br>{HR_CONTACT}
        </td>
      </tr>
    </table>
    <div class="letter-doc">{rendered_body}</div>
  </div>
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#777;text-align:center;margin:16px 0 0;">
    Sent by the HR team at {COMPANY_NAME} via the JADE HR console. Replies reach {HR_CONTACT}.
  </p>
</div>
</body></html>"""
