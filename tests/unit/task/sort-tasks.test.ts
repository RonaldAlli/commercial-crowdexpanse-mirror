import { test } from "node:test";
import assert from "node:assert/strict";

import { TASK_SORT_KEYS, sortTasks } from "../../../lib/task-sort";

type Row = { status: string; dueDate: Date | null; createdAt: Date; title: string };
const d = (s: string) => new Date(s);

const rows: Row[] = [
  { status: "COMPLETE", dueDate: d("2026-01-10"), createdAt: d("2026-01-01"), title: "Zeta" },
  { status: "BLOCKED", dueDate: d("2026-03-01"), createdAt: d("2026-01-05"), title: "Alpha" },
  { status: "BACKLOG", dueDate: null, createdAt: d("2026-01-09"), title: "Mike" },
  { status: "IN_PROGRESS", dueDate: d("2026-02-01"), createdAt: d("2026-01-07"), title: "beta" },
];

test("all whitelist keys are handled", () => {
  assert.deepEqual([...TASK_SORT_KEYS], ["workflow", "due", "newest", "title"]);
});

test("workflow order is BLOCKED, IN_PROGRESS, BACKLOG, COMPLETE", () => {
  const out = sortTasks(rows, "workflow").map((r) => r.status);
  assert.deepEqual(out, ["BLOCKED", "IN_PROGRESS", "BACKLOG", "COMPLETE"]);
});

test("workflow ties break by due date (missing due last)", () => {
  const tie: Row[] = [
    { status: "IN_PROGRESS", dueDate: null, createdAt: d("2026-01-01"), title: "no-due" },
    { status: "IN_PROGRESS", dueDate: d("2026-01-15"), createdAt: d("2026-01-02"), title: "has-due" },
  ];
  assert.deepEqual(sortTasks(tie, "workflow").map((r) => r.title), ["has-due", "no-due"]);
});

test("due sorts ascending with null due dates last", () => {
  const out = sortTasks(rows, "due").map((r) => r.title);
  assert.deepEqual(out, ["Zeta", "beta", "Alpha", "Mike"]);
});

test("newest sorts by createdAt descending", () => {
  // createdAt: Mike 01-09 > beta 01-07 > Alpha 01-05 > Zeta 01-01
  assert.deepEqual(sortTasks(rows, "newest").map((r) => r.title), ["Mike", "beta", "Alpha", "Zeta"]);
});

test("title sorts with locale compare (case-insensitive ordering)", () => {
  assert.deepEqual(sortTasks(rows, "title").map((r) => r.title), ["Alpha", "beta", "Mike", "Zeta"]);
});

test("is pure — does not mutate the input array", () => {
  const input = [...rows];
  const snapshot = input.map((r) => r.title);
  sortTasks(input, "title");
  assert.deepEqual(input.map((r) => r.title), snapshot);
});

test("empty input returns an empty array", () => {
  assert.deepEqual(sortTasks([], "workflow"), []);
});

test("due sort with all-null due dates preserves input order", () => {
  const nulls: Row[] = [
    { status: "BACKLOG", dueDate: null, createdAt: d("2026-01-01"), title: "first" },
    { status: "BACKLOG", dueDate: null, createdAt: d("2026-01-02"), title: "second" },
  ];
  assert.deepEqual(sortTasks(nulls, "due").map((r) => r.title), ["first", "second"]);
});

test("unknown status sorts after known ones in workflow order", () => {
  const weird: Row[] = [
    { status: "WEIRD", dueDate: null, createdAt: d("2026-01-01"), title: "weird" },
    { status: "BLOCKED", dueDate: null, createdAt: d("2026-01-01"), title: "blocked" },
  ];
  assert.deepEqual(sortTasks(weird, "workflow").map((r) => r.title), ["blocked", "weird"]);
});
