// Policy comprehension quiz — drawn from the exact same text in
// PolicyDocument.jsx (both the Retail and Corporate tabs, which the
// acknowledgement gate already requires everyone to read in full,
// regardless of their own employee_category). Shown after the
// read-and-acknowledge step so people can't just scroll to the bottom and
// click through without absorbing anything (see PolicyAcknowledgement.jsx).
//
// Every question's correct answer is a fact stated verbatim in
// PolicyDocument.jsx — if that page's numbers ever change, update the
// matching question(s) here too, or the quiz will grade against a stale
// policy.

export const QUIZ_POLICY_VERSION = "2026-08-23";

const QUESTION_BANK = [
  {
    id: "women-safety-time",
    question: "After what time are female employees eligible to travel by Cab/Ola/Uber, with bills submitted?",
    options: ["8:00 pm", "9:00 pm", "10:00 pm", "11:00 pm"],
    correctIndex: 2,
  },
  {
    id: "loan-min-service",
    question: "What is the minimum years of service required to apply for a company loan?",
    options: ["1 year", "2 years", "3 years", "5 years"],
    correctIndex: 2,
  },
  {
    id: "loan-interest",
    question: "At what interest rate is a company loan given?",
    options: ["0%", "8%", "12%", "18%"],
    correctIndex: 2,
  },
  {
    id: "loan-amount",
    question: "A company loan can be up to how many times the employee's salary?",
    options: ["The same as salary", "1.5x salary", "Double the salary", "Triple the salary"],
    correctIndex: 2,
  },
  {
    id: "reimbursement-window",
    question: "Expense reimbursements must be submitted within how many days of the expense (or before the 24th of the month)?",
    options: ["7 days", "10 days", "15 days", "30 days"],
    correctIndex: 2,
  },
  {
    id: "maternity-weeks",
    question: "How many weeks of maternity leave does the policy provide (for 1+ year of service)?",
    options: ["12 weeks", "16 weeks", "26 weeks", "52 weeks"],
    correctIndex: 2,
  },
  {
    id: "paternity-days",
    question: "How many days of paternity leave are provided?",
    options: ["1 day", "3 days", "5 days", "7 days"],
    correctIndex: 1,
  },
  {
    id: "bereavement-window",
    question: "Compassionate / bereavement leave must be taken within how many days of the death?",
    options: ["7 days", "10 days", "14 days", "30 days"],
    correctIndex: 2,
  },
  {
    id: "leave-entitlement",
    question: "How many all-purpose leaves per year are employees entitled to (pro-rata after probation)?",
    options: ["12", "18", "24", "30"],
    correctIndex: 2,
  },
  {
    id: "corporate-red-card",
    question: "Under the corporate Late-Coming policy, how many Yellow Cards in one pay cycle trigger a Red Card / Attendance Improvement Plan?",
    options: ["3", "5", "7", "10"],
    correctIndex: 2,
  },
  {
    id: "corporate-buffer-free",
    question: "In the Extended Monthly Buffer band (10:11–10:20 am), how many late arrivals per cycle carry no deduction?",
    options: ["1", "2", "3", "5"],
    correctIndex: 2,
  },
  {
    id: "corporate-severe-late",
    question: "A corporate employee arriving at 11:46 am or later is deducted how much?",
    options: ["No deduction", "¼ day", "½ day", "A full day"],
    correctIndex: 2,
  },
  {
    id: "corporate-stayback-midnight",
    question: "If a corporate employee stays back past midnight (6+ extra hours), what are they eligible for?",
    options: ["Nothing extra", "Coming in late the next day only", "A comp-off within 90 days", "Double pay for the day"],
    correctIndex: 2,
  },
  {
    id: "corporate-compoff-window",
    question: "Under the corporate policy, a comp-off (for working a Sunday/holiday) must be taken within how many days or it lapses?",
    options: ["30 days", "60 days", "90 days", "120 days"],
    correctIndex: 2,
  },
  {
    id: "corporate-carry-forward",
    question: "Under the corporate policy, how many unused leave days can be carried into the next year?",
    options: ["Up to 5", "Up to 7", "Up to 10", "Up to 15"],
    correctIndex: 3,
  },
  {
    id: "retail-compoff-window",
    question: "Under the retail policy, a comp-off (for working Sat/Sun/holiday) must be taken within how many days or it lapses?",
    options: ["15 days", "30 days", "60 days", "90 days"],
    correctIndex: 1,
  },
  {
    id: "retail-carry-forward",
    question: "Under the retail policy, how many unused leave days can be carried into the next year?",
    options: ["Up to 3", "Up to 5", "Up to 7", "Up to 10"],
    correctIndex: 2,
  },
  {
    id: "early-leaving-approval",
    question: "Early leaving and personal exigencies must be pre-approved by whom?",
    options: ["HR only", "Reporting manager / department head", "No approval is needed", "The Accounts team"],
    correctIndex: 1,
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

export function drawQuizQuestions() {
  return shuffled(QUESTION_BANK).slice(0, QUESTIONS_PER_ATTEMPT);
}
