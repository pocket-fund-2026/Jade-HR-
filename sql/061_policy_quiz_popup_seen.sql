-- The post-login quiz-score popup (App.jsx's QuizScorePopup) previously
-- tracked "already shown" in sessionStorage, which is wiped on every new
-- browser tab/session — so it kept reappearing on every fresh login. Track
-- it server-side, once per acknowledgement row, so it truly shows once.
alter table hr_policy_acknowledgements
  add column if not exists popup_seen_at timestamptz;
