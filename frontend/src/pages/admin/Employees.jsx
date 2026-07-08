import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/employees").then(({ data }) => setEmployees(data)).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Employees</h2>
        <Link
          to="/admin/employees/new"
          className="flex items-center gap-2 bg-jade-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-jade-700"
        >
          <Plus size={16} />
          Add Employee
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium">Gross (B+H+C)</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td className="px-4 py-6 text-gray-400" colSpan={5}>Loading...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td className="px-4 py-6 text-gray-400" colSpan={5}>No employees yet.</td></tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/employees/${e.id}`} className="text-jade-700 hover:underline">
                      {e.first_name} {e.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{e.employee_code}</td>
                  <td className="px-4 py-3">{e.designation || "-"}</td>
                  <td className="px-4 py-3">{formatINR(Number(e.basic) + Number(e.hra) + Number(e.conveyance))}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${e.is_active ? "bg-jade-50 text-jade-700" : "bg-gray-100 text-gray-500"}`}>
                      {e.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
