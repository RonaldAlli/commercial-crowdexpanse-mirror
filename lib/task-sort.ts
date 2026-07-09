import type { TaskStatus } from "@prisma/client";

// Display priority for the default "workflow" ordering: blocked/open work first,
// completed last. This intentionally differs from the TaskStatus enum's declared
// order (BACKLOG, IN_PROGRESS, BLOCKED, COMPLETE), so it CANNOT be expressed as a
// Prisma orderBy — the tasks list sorts in memory and slices for pagination.
// Shared by the /tasks page and the focused E2E so the two can't drift.
const STATUS_ORDER: Record<string, number> = { BLOCKED: 0, IN_PROGRESS: 1, BACKLOG: 2, COMPLETE: 3 };

export const TASK_SORT_KEYS = ["workflow", "due", "newest", "title"] as const;
export type TaskSortKey = (typeof TASK_SORT_KEYS)[number];

// Minimal row shape the comparators need — page rows and E2E rows both satisfy it.
type SortableTask = {
  status: TaskStatus | string;
  dueDate: Date | null;
  createdAt: Date;
  title: string;
};

// Ascending by due date, with missing due dates sorted last.
function dueDateAsc(a: SortableTask, b: SortableTask): number {
  const ad = a.dueDate ? a.dueDate.getTime() : Infinity;
  const bd = b.dueDate ? b.dueDate.getTime() : Infinity;
  return ad - bd;
}

/**
 * Return a new array sorted for the given whitelist key (pure — never mutates
 * the input). Callers should pass rows already fetched in a stable base order
 * (e.g. id asc); combined with a stable sort this makes pagination deterministic
 * across requests even when comparator keys tie.
 */
export function sortTasks<T extends SortableTask>(tasks: T[], sort: TaskSortKey): T[] {
  const copy = [...tasks];
  switch (sort) {
    case "due":
      copy.sort(dueDateAsc);
      break;
    case "newest":
      copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
    case "title":
      copy.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "workflow":
    default:
      copy.sort((a, b) => {
        const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        return s !== 0 ? s : dueDateAsc(a, b);
      });
  }
  return copy;
}
