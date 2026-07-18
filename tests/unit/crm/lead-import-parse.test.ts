import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The importer guards main() behind an executed-directly check, so importing is side-effect-free.
import {
  loadRecords,
  parseDelimitedRecords,
  parseJsonRecords,
  SUPPORTED_EXTENSIONS,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_COLUMNS,
  MAX_CELL_LENGTH,
} from "../../../scripts/import-dealautomator-commercial-leads";

test("Excel extensions are NOT supported (CSV-only, ADR-0006)", () => {
  assert.ok(!SUPPORTED_EXTENSIONS.has(".xlsx"));
  assert.ok(!SUPPORTED_EXTENSIONS.has(".xls"));
  assert.ok(SUPPORTED_EXTENSIONS.has(".csv"));
  assert.ok(SUPPORTED_EXTENSIONS.has(".json"));
});

test("loadRecords rejects .xlsx / .xls files explicitly", async () => {
  await assert.rejects(() => loadRecords("/tmp/whatever.xlsx"), /Excel files are not supported/);
  await assert.rejects(() => loadRecords("/tmp/whatever.xls"), /Excel files are not supported/);
});

test("loadRecords rejects an unsupported extension", async () => {
  await assert.rejects(() => loadRecords("/tmp/evil.exe"), /Unsupported file type/);
});

test("loadRecords rejects an oversized file before parsing", async () => {
  const tmp = path.join(os.tmpdir(), `crm-parse-big-${process.pid}.csv`);
  // Write a header + a body just over the 15MB cap.
  await fs.writeFile(tmp, "a,b\n" + "x,y\n".repeat(4_000_000)); // ~16MB
  try {
    await assert.rejects(() => loadRecords(tmp), /too large/i);
  } finally {
    await fs.rm(tmp, { force: true });
  }
});

test("parseDelimitedRecords enforces the row limit", () => {
  const content = "h1,h2\n" + Array(MAX_IMPORT_ROWS + 1).fill("a,b").join("\n");
  assert.throws(() => parseDelimitedRecords(content, "test.csv"), /Too many rows/);
});

test("parseDelimitedRecords enforces the column limit", () => {
  const header = Array(MAX_IMPORT_COLUMNS + 1).fill("c").map((c, i) => `${c}${i}`).join(",");
  const content = `${header}\nv`;
  assert.throws(() => parseDelimitedRecords(content, "test.csv"), /Too many columns/);
});

test("parseDelimitedRecords enforces the cell-length limit", () => {
  const huge = "z".repeat(MAX_CELL_LENGTH + 1);
  const content = `name,notes\nAcme,${huge}`;
  assert.throws(() => parseDelimitedRecords(content, "test.csv"), /maximum length/);
});

test("parseJsonRecords enforces the record-count limit", () => {
  const arr = JSON.stringify(Array(MAX_IMPORT_ROWS + 1).fill({ owner_name: "x" }));
  assert.throws(() => parseJsonRecords(arr, "test.json"), /Too many records/);
});

test("a small valid CSV parses to the expected record count", () => {
  const content = "owner_name,address\nAcme LLC,1 Main St\nBeta Inc,2 Oak Ave";
  const records = parseDelimitedRecords(content, "test.csv");
  assert.equal(records.length, 2);
});
