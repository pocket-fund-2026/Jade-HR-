import StatCard from "./StatCard.jsx";
import { formatDate, formatINR, formatTime } from "../lib/format.js";

export default function PayslipDetail({ summary }) {
  if (!summary) return null;

  const gross = summary.basic + summary.hra + summary.conveyance;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Present Days" value={`${summary.present_days}/${summary.days_in_month}`} />
        <StatCard label="Total Hours Worked" value={summary.total_hours_worked} />
        <StatCard label="Total OT Hours" value={summary.total_ot_hours} />
        <StatCard label="OT Amount" value={formatINR(summary.ot_amount)} accent="text-jade-700" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-medium text-gray-700 mb-4">OT Calculation</p>
        <div className="text-sm space-y-2 text-gray-600">
          <div className="flex justify-between"><span>Basic</span><span>{formatINR(summary.basic)}</span></div>
          <div className="flex justify-between"><span>HRA</span><span>{formatINR(summary.hra)}</span></div>
          <div className="flex justify-between"><span>Conveyance</span><span>{formatINR(summary.conveyance)}</span></div>
          <div className="flex justify-between font-medium text-gray-900 border-t border-gray-100 pt-2">
            <span>Total Salary</span><span>{formatINR(gross)}</span>
          </div>
          <div className="flex justify-between pt-2">
            <span>Per Day Salary ({formatINR(gross)} / {summary.days_in_month} days)</span>
            <span>{formatINR(summary.per_day_salary)}</span>
          </div>
          <div className="flex justify-between">
            <span>Per Hour Salary (Per Day / 8 hrs)</span>
            <span>{formatINR(summary.per_hour_salary)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total OT Hours</span>
            <span>{summary.total_ot_hours}</span>
          </div>
          <div className="flex justify-between font-medium text-jade-700 border-t border-gray-100 pt-2">
            <span>OT Amount</span>
            <span>{formatINR(summary.ot_amount)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Gross Salary (Basic + HRA + Conveyance + Other)</span>
          <span className="font-medium">{formatINR(summary.gross_salary)}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-gray-500">OT Amount</span>
          <span className="font-medium">{formatINR(summary.ot_amount)}</span>
        </div>
        <div className="flex justify-between text-base mt-3 pt-3 border-t border-gray-100">
          <span className="font-semibold">Total Payable</span>
          <span className="font-semibold text-jade-700">{formatINR(summary.total_payable)}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <p className="px-6 pt-4 text-sm font-medium text-gray-700">Daily Attendance</p>
        <table className="w-full text-sm mt-2">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">In</th>
              <th className="px-4 py-2 font-medium">Out</th>
              <th className="px-4 py-2 font-medium">Hours</th>
              <th className="px-4 py-2 font-medium">OT Hours</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.daily?.map((d) => (
              <tr key={d.date}>
                <td className="px-4 py-2">{formatDate(d.date)}</td>
                <td className="px-4 py-2">{formatTime(d.first_in)}</td>
                <td className="px-4 py-2">{formatTime(d.last_out)}</td>
                <td className="px-4 py-2">{d.hours_worked || "-"}</td>
                <td className="px-4 py-2">{d.ot_hours || "-"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      d.status === "present"
                        ? "bg-jade-50 text-jade-700"
                        : d.status === "absent"
                          ? "bg-red-50 text-red-600"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
