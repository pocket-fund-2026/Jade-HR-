// Policy comprehension quiz — drawn from the exact same text in
// PolicyDocument.jsx, scoped to the ONE policy tab the signed-in person was
// required to read (Retail or Corporate, per their employee_category — see
// the tags below). Shown after the read-and-acknowledge step so people
// can't just scroll to the bottom and click through without absorbing
// anything (see PolicyAcknowledgement.jsx).
//
// Every question's correct answer is a fact stated verbatim in
// PolicyDocument.jsx — if that page's numbers ever change, update the
// matching question(s) here too, or the quiz will grade against a stale
// policy.

export const QUIZ_POLICY_VERSION = "2026-08-23";
// Must match backend/routers/policy_ack.py's QUIZ_PASS_RATIO — kept in sync
// manually since the frontend uses it only for the "you need N of M"
// display text, not for deciding pass/fail (the backend always does that).
export const QUIZ_PASS_RATIO = 0.5;

// tag: 'common' (true regardless of tab/category) | 'corporate' (Corporate
// Policy tab only) | 'retail' (Retail Policy tab only) — matches
// PolicyAcknowledgement.jsx now only requiring the ONE tab matching the
// signed-in person's own hr_employees.employee_category ('corporate' vs
// 'factory_retail', same 2-value split PolicyDocument.jsx already uses), so
// the quiz must draw only from what that person actually just read.
const QUESTION_BANK = [
  {
    id: "women-safety-time",
    tag: "common",
    question: "After what time are female employees eligible to travel by Cab/Ola/Uber, with bills submitted?",
    options: ["8:00 pm", "9:00 pm", "10:00 pm", "11:00 pm"],
    correctIndex: 2,
  },
  {
    id: "loan-min-service",
    tag: "common",
    question: "What is the minimum years of service required to apply for a company loan?",
    options: ["1 year", "2 years", "3 years", "5 years"],
    correctIndex: 2,
  },
  {
    id: "loan-interest",
    tag: "common",
    question: "At what interest rate is a company loan given?",
    options: ["0%", "8%", "12%", "18%"],
    correctIndex: 2,
  },
  {
    id: "loan-amount",
    tag: "common",
    question: "A company loan can be up to how many times the employee's salary?",
    options: ["The same as salary", "1.5x salary", "Double the salary", "Triple the salary"],
    correctIndex: 2,
  },
  {
    id: "reimbursement-window",
    tag: "common",
    question: "Expense reimbursements must be submitted within how many days of the expense (or before the 24th of the month)?",
    options: ["7 days", "10 days", "15 days", "30 days"],
    correctIndex: 2,
  },
  {
    id: "maternity-weeks",
    tag: "common",
    question: "How many weeks of maternity leave does the policy provide (for 1+ year of service)?",
    options: ["12 weeks", "16 weeks", "26 weeks", "52 weeks"],
    correctIndex: 2,
  },
  {
    id: "paternity-days",
    tag: "common",
    question: "How many days of paternity leave are provided?",
    options: ["1 day", "3 days", "5 days", "7 days"],
    correctIndex: 1,
  },
  {
    id: "bereavement-window",
    tag: "common",
    question: "Compassionate / bereavement leave must be taken within how many days of the death?",
    options: ["7 days", "10 days", "14 days", "30 days"],
    correctIndex: 2,
  },
  {
    id: "leave-entitlement",
    tag: "common",
    question: "How many all-purpose leaves per year are employees entitled to (pro-rata after probation)?",
    options: ["12", "18", "24", "30"],
    correctIndex: 2,
  },
  {
    id: "early-leaving-approval",
    tag: "common",
    question: "Early leaving and personal exigencies must be pre-approved by whom?",
    options: ["HR only", "Reporting manager / department head", "No approval is needed", "The Accounts team"],
    correctIndex: 1,
  },
  {
    id: "corporate-red-card",
    tag: "corporate",
    question: "Under the corporate Late-Coming policy, how many Yellow Cards in one pay cycle trigger a Red Card / Attendance Improvement Plan?",
    options: ["3", "5", "7", "10"],
    correctIndex: 2,
  },
  {
    id: "corporate-buffer-free",
    tag: "corporate",
    question: "In the Extended Monthly Buffer band (10:11–10:20 am), how many late arrivals per cycle carry no deduction?",
    options: ["1", "2", "3", "5"],
    correctIndex: 2,
  },
  {
    id: "corporate-severe-late",
    tag: "corporate",
    question: "A corporate employee arriving at 11:46 am or later is deducted how much?",
    options: ["No deduction", "¼ day", "½ day", "A full day"],
    correctIndex: 2,
  },
  {
    id: "corporate-stayback-midnight",
    tag: "corporate",
    question: "If a corporate employee stays back past midnight (6+ extra hours), what are they eligible for?",
    options: ["Nothing extra", "Coming in late the next day only", "A comp-off within 90 days", "Double pay for the day"],
    correctIndex: 2,
  },
  {
    id: "corporate-compoff-window",
    tag: "corporate",
    question: "Under the corporate policy, a comp-off (for working a Sunday/holiday) must be taken within how many days or it lapses?",
    options: ["30 days", "60 days", "90 days", "120 days"],
    correctIndex: 2,
  },
  {
    id: "corporate-carry-forward",
    tag: "corporate",
    question: "Under the corporate policy, how many unused leave days can be carried into the next year?",
    options: ["Up to 5", "Up to 7", "Up to 10", "Up to 15"],
    correctIndex: 3,
  },
  {
    id: "retail-compoff-window",
    tag: "retail",
    // Worded to point at the retail Comp-off section specifically: the same
    // tab's "Early going & late coming" section gives 120 days for a
    // called-in holiday exigency, so an unqualified "comp-off" question
    // would have two defensible answers.
    question: "Under the retail Comp-off rule, a comp-off earned for working a Saturday/Sunday/public holiday must be taken within how many days or it lapses?",
    options: ["15 days", "30 days", "60 days", "90 days"],
    correctIndex: 1,
  },
  {
    id: "retail-compoff-continuous",
    tag: "retail",
    question: "Under the retail policy, how many continuous comp-off days can be taken at a time before the extra days become unpaid leave?",
    options: ["1", "2", "3", "5"],
    correctIndex: 0,
  },
  {
    id: "retail-card-system-scope",
    tag: "retail",
    question: "Does the Yellow Card / Red Card / Attendance Improvement Plan system apply to retail teams?",
    options: [
      "Yes, exactly as it does for corporate",
      "No — it is corporate-only; retail lateness is managed by the store roster and HOD",
      "Yes, but only for store managers",
      "Only during sale periods",
    ],
    correctIndex: 1,
  },
  {
    id: "retail-carry-forward",
    tag: "retail",
    question: "Under the retail policy, how many unused leave days can be carried into the next year?",
    options: ["Up to 3", "Up to 5", "Up to 7", "Up to 10"],
    correctIndex: 2,
  },
];

const QUESTIONS_PER_ATTEMPT = 5;

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// `employeeCategory` — pass the signed-in person's hr_employees.employee_category
// ('corporate' or 'factory_retail'/anything else). Draws only from 'common'
// plus their own tab's tag, so nobody is quizzed on a document they weren't
// required to read.
export function drawQuizQuestions(employeeCategory) {
  const ownTag = employeeCategory === "corporate" ? "corporate" : "retail";
  const pool = QUESTION_BANK.filter((q) => q.tag === "common" || q.tag === ownTag);
  return shuffled(pool).slice(0, QUESTIONS_PER_ATTEMPT);
}

// Shared between PolicyAcknowledgement.jsx (marks it seen the moment
// someone finishes the quiz in this browser session) and App.jsx's
// post-login QuizScorePopup (shows it once per session otherwise) — keeps
// the popup from immediately re-appearing right after someone just saw
// their score at the end of the quiz itself.
export function quizPopupSessionKey(policyVersion) {
  return `jade_hr_quiz_popup_${policyVersion}`;
}
