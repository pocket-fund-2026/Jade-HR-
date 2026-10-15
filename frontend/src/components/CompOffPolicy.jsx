export default function CompOffPolicy({ className = "" }) {
  return (
    <section aria-label="Revised Comp-Off policy" className={`border-l-2 border-jade-500 bg-jade-500/5 p-4 text-sm text-ink/80 ${className}`}>
      <p className="font-semibold text-ink">Compensatory Off · Effective 1 November 2025</p>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        <li>Earn Comp-Off only for work on a declared public holiday or your weekly off.</li>
        <li>Up to and including 4 hours: ½ day. More than 4 hours: 1 full day.</li>
        <li>Use it within 120 days of the day worked. Club a maximum of 2 Comp-Off days at a time.</li>
        <li>Do not club it with weekly offs, public holidays or festival breaks. It cannot be encashed or transferred.</li>
      </ul>
      <p className="mt-3">Confirm the work with HR, then apply under <strong>Comp-Off</strong> in the leave request form. Your reporting manager/HOD approves the request. Check the expiry date in your balance before choosing your leave dates.</p>
    </section>
  );
}
