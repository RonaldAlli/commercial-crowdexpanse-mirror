import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIST_MIN_QUERY,
  LIST_PAGE_SIZE,
  ilike,
  listQueryString,
  parseListParams,
  totalPages,
} from "../../../lib/list-params";

const opts = { sortKeys: ["newest", "name"] as const, defaultSort: "newest" };

test("trims the query and flags hasQuery only past the min length", () => {
  assert.deepEqual(
    { q: parseListParams({ q: "  hi  " }, opts).q, has: parseListParams({ q: "  hi  " }, opts).hasQuery },
    { q: "hi", has: true },
  );
  assert.equal(parseListParams({ q: "a" }, opts).hasQuery, false); // below LIST_MIN_QUERY
  assert.equal(parseListParams({}, opts).hasQuery, false);
  assert.equal(LIST_MIN_QUERY, 2);
});

test("sort resolves against the whitelist, else falls back to default", () => {
  assert.equal(parseListParams({ sort: "name" }, opts).sort, "name");
  assert.equal(parseListParams({ sort: "garbage" }, opts).sort, "newest");
  assert.equal(parseListParams({}, opts).sort, "newest");
});

test("page clamps to >= 1 and drives skip/take", () => {
  assert.equal(parseListParams({ page: "3" }, opts).page, 3);
  assert.equal(parseListParams({ page: "0" }, opts).page, 1);
  assert.equal(parseListParams({ page: "-5" }, opts).page, 1);
  assert.equal(parseListParams({ page: "notnum" }, opts).page, 1);
  const p = parseListParams({ page: "3" }, opts);
  assert.equal(p.skip, (3 - 1) * LIST_PAGE_SIZE);
  assert.equal(p.take, LIST_PAGE_SIZE);
});

test("a custom page size overrides skip/take math", () => {
  const p = parseListParams({ page: "2" }, { ...opts, pageSize: 5 });
  assert.equal(p.skip, 5);
  assert.equal(p.take, 5);
});

test("totalPages is at least 1 and ceils", () => {
  assert.equal(totalPages(0), 1);
  assert.equal(totalPages(20), 1);
  assert.equal(totalPages(21), 2);
  assert.equal(totalPages(9, 3), 3);
});

test("listQueryString drops empty/undefined and encodes", () => {
  assert.equal(listQueryString({ q: "hi there", page: 2, sort: "", extra: undefined }), "?q=hi+there&page=2");
  assert.equal(listQueryString({}), "");
});

test("ilike builds a case-insensitive contains filter", () => {
  assert.deepEqual(ilike("acme"), { contains: "acme", mode: "insensitive" });
});
