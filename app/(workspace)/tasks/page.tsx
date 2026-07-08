import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { tasks } from "@/lib/demo-data";

const taskTone = {
  Complete: "success",
  Blocked: "danger",
  "In Progress": "info",
  Backlog: "warning",
} as const;

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tasks"
        title="Tasks"
        description="Execution list tied to live deals."
        actions={<button className="btn-primary">New task</button>}
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="table-head">Task</th>
                <th className="table-head">Owner</th>
                <th className="table-head">Status</th>
                <th className="table-head">Due</th>
                <th className="table-head">Linked deal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <tr key={task.id} className="transition-colors hover:bg-slate-50/60">
                  <td className="table-cell font-medium text-slate-900">{task.title}</td>
                  <td className="table-cell whitespace-nowrap text-slate-600">{task.owner}</td>
                  <td className="table-cell">
                    <Badge tone={taskTone[task.status]} dot>
                      {task.status}
                    </Badge>
                  </td>
                  <td className="table-cell metric whitespace-nowrap text-slate-600">{task.due}</td>
                  <td className="table-cell text-slate-600">{task.linkedDeal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
