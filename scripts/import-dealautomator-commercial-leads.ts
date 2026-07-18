import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { AssetType, OpportunityStage, type OwnerEntityType } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { resolveOrCreateProperty } from "../lib/intelligence/property-resolver";
import { addPropertyExternalIdentifier } from "../lib/intelligence/property-identity";
import { computeMatchKey } from "../lib/intelligence/owner-identity";
import { createOwner } from "../lib/owners";

type LeadRecord = {
  lead_id?: string;
  batch_date?: string;
  source_system?: string;
  source_file?: string;
  market?: string;
  market_slug?: string;
  source_page?: number;
  page_range?: string;
  address?: string;
  asset_summary?: string;
  owner?: string;
  tags?: string[];
  tags_pipe?: string;
  ltv?: string;
  market_value?: string;
  raw_text?: string;
  status?: string;
  stage?: string;
  assigned_to?: string;
  notes?: string;
};

type ParsedArgs = {
  file: string;
  organizationSlug: string;
  actorEmail: string;
  provider: string;
  dryRun: boolean;
  limit: number | null;
  summaryFile: string | null;
};

type ParsedAddress = {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string | null;
};

type PropertyFacts = {
  assetType: AssetType;
  acreage: number | null;
  squareFeet: number | null;
  unitCount: number | null;
  propertyName: string;
  operationalStatus: string;
};

type ImportSummary = {
  sourceFile: string;
  dryRun: boolean;
  totalLoaded: number;
  deduped: number;
  attempted: number;
  skipped: number;
  ownersCreated: number;
  ownersReused: number;
  propertiesCreated: number;
  propertiesResolved: number;
  externalIdsAttached: number;
  opportunitiesCreated: number;
  opportunitiesReused: number;
  notesCreated: number;
  errors: Array<{ leadId: string; message: string }>;
};

const DEFAULT_PROVIDER = "dealautomator.com/commercial-lead";
// CSV-only intake (ADR-0006). Excel (.xlsx/.xls) is intentionally unsupported — the SheetJS
// untrusted-file parser was removed to eliminate its known-CVE / resource-exhaustion surface.
const SUPPORTED_EXTENSIONS = new Set([".json", ".csv", ".tsv", ".txt"]);
// Pre-parse resource limits (fail closed before materializing a hostile file).
const MAX_IMPORT_FILE_BYTES = 15_000_000; // 15 MB
const MAX_IMPORT_ROWS = 50_000;
const MAX_IMPORT_COLUMNS = 200;
const MAX_CELL_LENGTH = 20_000;

const HEADER_ALIASES: Record<string, keyof LeadRecord> = {
  leadid: "lead_id",
  lead_id: "lead_id",
  id: "lead_id",
  batchdate: "batch_date",
  batch_date: "batch_date",
  sourcedate: "batch_date",
  sourcesystem: "source_system",
  source_system: "source_system",
  source: "source_system",
  sourcefile: "source_file",
  source_file: "source_file",
  file: "source_file",
  market: "market",
  marketslug: "market_slug",
  market_slug: "market_slug",
  sourcepage: "source_page",
  source_page: "source_page",
  page: "source_page",
  pagerange: "page_range",
  page_range: "page_range",
  address: "address",
  propertyaddress: "address",
  property_address: "address",
  streetaddress: "address",
  street_address: "address",
  assetsummary: "asset_summary",
  asset_summary: "asset_summary",
  asset: "asset_summary",
  assettype: "asset_summary",
  asset_type: "asset_summary",
  description: "asset_summary",
  owner: "owner",
  ownername: "owner",
  owner_name: "owner",
  tags: "tags_pipe",
  tag: "tags_pipe",
  tagspipe: "tags_pipe",
  tags_pipe: "tags_pipe",
  ltv: "ltv",
  marketvalue: "market_value",
  market_value: "market_value",
  rawtext: "raw_text",
  raw_text: "raw_text",
  raw: "raw_text",
  status: "status",
  stage: "stage",
  assignedto: "assigned_to",
  assigned_to: "assigned_to",
  assignee: "assigned_to",
  notes: "notes",
  note: "notes",
};

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    file: "",
    organizationSlug: "commercial-crowdexpanse",
    actorEmail: "operator@commercial.crowdexpanse.com",
    provider: DEFAULT_PROVIDER,
    dryRun: false,
    limit: null,
    summaryFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--file") {
      out.file = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--org" || arg === "--organization-slug") {
      out.organizationSlug = argv[index + 1] ?? out.organizationSlug;
      index += 1;
      continue;
    }
    if (arg === "--actor-email") {
      out.actorEmail = argv[index + 1] ?? out.actorEmail;
      index += 1;
      continue;
    }
    if (arg === "--provider") {
      out.provider = argv[index + 1] ?? out.provider;
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const value = Number.parseInt(argv[index + 1] ?? "", 10);
      out.limit = Number.isFinite(value) && value > 0 ? value : null;
      index += 1;
      continue;
    }
    if (arg === "--summary-file") {
      out.summaryFile = argv[index + 1] ?? null;
      index += 1;
    }
  }

  if (!out.file) {
    throw new Error("Missing required --file argument.");
  }

  return out;
}

function normalizeWhitespace(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function splitTagValues(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/[|,;\n]+/)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferMarketSlug(market: string | undefined): string {
  return slugify(normalizeWhitespace(market));
}

function inferLeadId(record: LeadRecord): string {
  const pieces = [
    normalizeWhitespace(record.market_slug) || inferMarketSlug(record.market),
    slugify(record.address ?? ""),
    slugify(record.owner ?? ""),
  ].filter(Boolean);
  return pieces.join("-") || `lead-${Math.random().toString(36).slice(2, 10)}`;
}

function asTags(record: LeadRecord): string[] {
  const direct = Array.isArray(record.tags) ? record.tags : [];
  const piped = normalizeWhitespace(record.tags_pipe)
    .split("|")
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  return Array.from(new Set([...direct.map((entry) => normalizeWhitespace(entry)).filter(Boolean), ...piped]));
}

function scoreRecord(record: LeadRecord): number {
  return (
    normalizeWhitespace(record.asset_summary).length +
    normalizeWhitespace(record.raw_text).length +
    normalizeWhitespace(record.owner).length +
    normalizeWhitespace(record.address).length +
    asTags(record).length * 20
  );
}

function mergeRecords(base: LeadRecord, incoming: LeadRecord): LeadRecord {
  const preferred = scoreRecord(incoming) > scoreRecord(base) ? incoming : base;
  const secondary = preferred === base ? incoming : base;
  const tags = Array.from(new Set([...asTags(preferred), ...asTags(secondary)]));

  return {
    ...secondary,
    ...preferred,
    tags,
    tags_pipe: tags.join("|"),
    raw_text: normalizeWhitespace(preferred.raw_text) || normalizeWhitespace(secondary.raw_text),
    asset_summary: normalizeWhitespace(preferred.asset_summary) || normalizeWhitespace(secondary.asset_summary),
    owner: normalizeWhitespace(preferred.owner) || normalizeWhitespace(secondary.owner),
    address: normalizeWhitespace(preferred.address) || normalizeWhitespace(secondary.address),
    notes: normalizeWhitespace(preferred.notes) || normalizeWhitespace(secondary.notes),
  };
}

function dedupeRecords(records: LeadRecord[]): LeadRecord[] {
  const byKey = new Map<string, LeadRecord>();
  for (const record of records) {
    const leadId = normalizeWhitespace(record.lead_id) || inferLeadId(record);
    const fallbackKey = [
      normalizeWhitespace(record.market_slug),
      normalizeWhitespace(record.address).toLowerCase(),
      normalizeWhitespace(record.owner).toLowerCase(),
    ].join("|");
    const key = leadId || fallbackKey;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeRecords(existing, record) : { ...record, tags: asTags(record), tags_pipe: asTags(record).join("|") });
  }
  return Array.from(byKey.values());
}

function parseNumber(fragment: string | undefined | null): number | null {
  const normalized = normalizeWhitespace(fragment).replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(fragment: string | undefined | null): number | null {
  const parsed = parseNumber(fragment);
  return parsed === null ? null : Math.round(parsed);
}

function parseMarket(market: string | undefined): { city: string; state: string | null } {
  const cleaned = normalizeWhitespace(market);
  const [cityPart, statePart] = cleaned.split(",").map((entry) => normalizeWhitespace(entry));
  return {
    city: cityPart,
    state: statePart || null,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAddress(address: string | undefined, market: string | undefined): ParsedAddress {
  const cleaned = normalizeWhitespace(address);
  const marketInfo = parseMarket(market);
  if (cleaned && marketInfo.city && marketInfo.state) {
    const pattern = new RegExp(`^(.*)\\s+${escapeRegex(marketInfo.city)},\\s*${escapeRegex(marketInfo.state)}\\s+(\\d{5}(?:-\\d{4})?)$`, "i");
    const match = cleaned.match(pattern);
    if (match) {
      return {
        addressLine1: normalizeWhitespace(match[1]),
        city: marketInfo.city,
        state: marketInfo.state.toUpperCase(),
        postalCode: normalizeWhitespace(match[2]) || null,
      };
    }
  }

  const fallback = cleaned.match(/^(.*?),?\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (fallback) {
    return {
      addressLine1: normalizeWhitespace(fallback[1]),
      city: normalizeWhitespace(fallback[2]),
      state: normalizeWhitespace(fallback[3]).toUpperCase(),
      postalCode: normalizeWhitespace(fallback[4]) || null,
    };
  }

  if (cleaned && marketInfo.city && marketInfo.state) {
    return {
      addressLine1: cleaned.replace(new RegExp(`\\s+${escapeRegex(marketInfo.city)},\\s*${escapeRegex(marketInfo.state)}.*$`, "i"), "").trim() || cleaned,
      city: marketInfo.city,
      state: marketInfo.state.toUpperCase(),
      postalCode: null,
    };
  }

  throw new Error(`Unable to parse address: ${cleaned || "(empty)"}`);
}

function inferOwnerEntityType(ownerName: string): OwnerEntityType {
  const upper = normalizeWhitespace(ownerName).toUpperCase();
  if (!upper) return "UNKNOWN";
  if (/\bCITY OF\b|\bCOUNTY OF\b|\bSTATE OF\b|\bHOUSING AUTHORITY\b|\bUNIVERSITY\b/.test(upper)) return "GOVERNMENT";
  if (/\bTRUST\b/.test(upper)) return "TRUST";
  if (/\bLLC\b|\bL L C\b/.test(upper)) return "LLC";
  if (/\bLP\b|\bL P\b|\bLLP\b|\bL L P\b|\bPARTNERSHIP\b/.test(upper)) return "PARTNERSHIP";
  if (/\bREIT\b/.test(upper)) return "REIT";
  if (/\bINC\b|\bCORP\b|\bCO\b|\bCOMPANY\b|\bCORPORATION\b/.test(upper)) return "CORPORATION";
  return "INDIVIDUAL";
}

function inferPriority(tags: string[]): string | null {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.includes("free & clear") && normalized.includes("absentee owner")) return "High";
  if (normalized.includes("free & clear") || normalized.includes("cash buyer")) return "Medium";
  return null;
}

function inferAssetType(summary: string, squareFeet: number | null, unitCount: number | null): AssetType {
  const text = normalizeWhitespace(summary).toLowerCase();
  if (/multi-family|multifamily|apartment/.test(text)) return AssetType.MULTIFAMILY;
  if (/self storage|self-storage/.test(text)) return AssetType.SELF_STORAGE;
  if (/rv park/.test(text)) return AssetType.RV_PARK;
  if (/mobile home park|manufactured housing/.test(text)) return AssetType.MOBILE_HOME_PARK;
  if (/mixed use|mixed-use/.test(text)) return AssetType.MIXED_USE;
  if (/hospitality|hotel|motel/.test(text)) return AssetType.HOSPITALITY;
  if (/industrial|warehouse|distribution/.test(text)) return AssetType.INDUSTRIAL;
  if (/office/.test(text)) return AssetType.OFFICE;
  if (/retail|shopping center|strip center/.test(text)) return AssetType.RETAIL;
  if (/vacant land|parking lot/.test(text)) return AssetType.LAND;
  if (unitCount !== null && unitCount >= 2) return AssetType.MULTIFAMILY;
  if (squareFeet === null && (/lot sqft|acres|zoned/.test(text) || /special purpose|general/.test(text))) return AssetType.LAND;
  if (/special purpose|religious/.test(text)) return AssetType.MIXED_USE;
  if (/general/.test(text) && squareFeet !== null) return AssetType.MIXED_USE;
  return AssetType.LAND;
}

function parsePropertyFacts(record: LeadRecord, parsedAddress: ParsedAddress): PropertyFacts {
  const summary = normalizeWhitespace(record.asset_summary);
  const acreageMatch = summary.match(/([\d,.]+)\s+acres?/i);
  const squareFeetMatch = summary.match(/([\d,.]+)\s+sqft/i);
  const unitsMatch = summary.match(/(\d+)\s+units?/i);

  const acreage = parseNumber(acreageMatch?.[1] ?? null);
  const squareFeet = parseInteger(squareFeetMatch?.[1] ?? null);
  const unitCount = parseInteger(unitsMatch?.[1] ?? null);
  const assetType = inferAssetType(summary, squareFeet, unitCount);

  return {
    assetType,
    acreage,
    squareFeet,
    unitCount,
    propertyName: parsedAddress.addressLine1 || normalizeWhitespace(record.address) || "Imported Property",
    operationalStatus: "Lead Imported",
  };
}

function parseDelimitedRow(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.replace(/\r/g, ""));
}

function chooseDelimiter(text: string): string {
  const header = text.split(/\r?\n/).find((line) => normalizeWhitespace(line)) ?? "";
  const tabCount = (header.match(/\t/g) ?? []).length;
  const commaCount = (header.match(/,/g) ?? []).length;
  const pipeCount = (header.match(/\|/g) ?? []).length;
  if (tabCount >= commaCount && tabCount >= pipeCount && tabCount > 0) return "\t";
  if (pipeCount > commaCount && pipeCount > 0) return "|";
  return ",";
}

function rowToLeadRecord(raw: Record<string, unknown>, sourceFile: string): LeadRecord {
  const canonical: LeadRecord = {};
  for (const [key, rawValue] of Object.entries(raw)) {
    const header = HEADER_ALIASES[normalizeHeader(key)];
    if (!header) continue;
    const value =
      Array.isArray(rawValue)
        ? rawValue.map((entry) => normalizeWhitespace(String(entry))).filter(Boolean)
        : normalizeWhitespace(String(rawValue ?? ""));

    if (header === "tags_pipe") {
      const tags = Array.isArray(value) ? value : splitTagValues(value);
      canonical.tags = tags;
      canonical.tags_pipe = tags.join("|");
      continue;
    }
    if (header === "source_page") {
      const parsed = Number.parseInt(Array.isArray(value) ? value[0] ?? "" : value, 10);
      if (Number.isFinite(parsed)) canonical.source_page = parsed;
      continue;
    }
    (canonical as Record<string, unknown>)[header] = value;
  }

  canonical.source_file = canonical.source_file || path.basename(sourceFile);
  canonical.source_system = canonical.source_system || "Imported File";
  canonical.market_slug = canonical.market_slug || inferMarketSlug(canonical.market);
  canonical.lead_id = canonical.lead_id || inferLeadId(canonical);
  canonical.tags = canonical.tags ?? splitTagValues(canonical.tags_pipe ?? "");
  canonical.tags_pipe = canonical.tags_pipe || (canonical.tags ?? []).join("|");
  canonical.raw_text =
    canonical.raw_text ||
    [
      normalizeWhitespace(canonical.address),
      normalizeWhitespace(canonical.asset_summary),
      normalizeWhitespace(canonical.owner) ? `Owner: ${normalizeWhitespace(canonical.owner)}` : "",
      canonical.tags?.length ? canonical.tags.join(" ") : "",
    ]
      .filter(Boolean)
      .join(" ");
  return canonical;
}

function assertCell(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_CELL_LENGTH) {
    throw new Error(`Cell value exceeds the maximum length of ${MAX_CELL_LENGTH} characters.`);
  }
  return value;
}

function parseJsonRecords(content: string, sourceFile: string): LeadRecord[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of lead records.");
  }
  if (parsed.length > MAX_IMPORT_ROWS) {
    throw new Error(`Too many records: ${parsed.length} (max ${MAX_IMPORT_ROWS}).`);
  }
  return parsed.map((entry) => {
    const obj = (entry ?? {}) as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > MAX_IMPORT_COLUMNS) {
      throw new Error(`Record has too many fields: ${keys.length} (max ${MAX_IMPORT_COLUMNS}).`);
    }
    for (const key of keys) assertCell(obj[key]);
    return rowToLeadRecord(obj, sourceFile);
  });
}

function parseDelimitedRecords(content: string, sourceFile: string): LeadRecord[] {
  const delimiter = chooseDelimiter(content);
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ""))
    .filter((line) => normalizeWhitespace(line));
  if (lines.length < 2) {
    throw new Error("Delimited files need a header row plus at least one record.");
  }
  if (lines.length - 1 > MAX_IMPORT_ROWS) {
    throw new Error(`Too many rows: ${lines.length - 1} (max ${MAX_IMPORT_ROWS}).`);
  }
  const headers = parseDelimitedRow(lines[0], delimiter);
  if (headers.length > MAX_IMPORT_COLUMNS) {
    throw new Error(`Too many columns: ${headers.length} (max ${MAX_IMPORT_COLUMNS}).`);
  }
  return lines.slice(1).map((line) => {
    const values = parseDelimitedRow(line, delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = assertCell(values[index] ?? "");
    });
    return rowToLeadRecord(row, sourceFile);
  });
}

async function loadRecords(sourceFile: string): Promise<LeadRecord[]> {
  const extension = path.extname(sourceFile).toLowerCase();
  if (extension === ".xlsx" || extension === ".xls") {
    throw new Error("Excel files are not supported. Export to CSV and re-upload (ADR-0006).");
  }
  if (extension && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${extension}`);
  }
  // Pre-parse size guard \u2014 reject a hostile/oversized file before reading it into memory.
  const stat = await fs.stat(sourceFile);
  if (stat.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`Import file too large: ${stat.size} bytes (max ${MAX_IMPORT_FILE_BYTES}).`);
  }
  const buffer = await fs.readFile(sourceFile);
  const text = buffer.toString("utf8");
  const firstNonWhitespace = text.trimStart()[0];

  if (extension === ".json" || firstNonWhitespace === "[" || firstNonWhitespace === "{") {
    return parseJsonRecords(text, sourceFile);
  }
  return parseDelimitedRecords(text, sourceFile);
}

function buildOpportunityTitle(record: LeadRecord, propertyName: string): string {
  const market = normalizeWhitespace(record.market);
  return market ? `${propertyName} (${market})` : propertyName;
}

function buildOpportunitySummary(record: LeadRecord, tags: string[]): string {
  const parts = [
    normalizeWhitespace(record.asset_summary),
    tags.length ? `Tags: ${tags.join(", ")}` : "",
    normalizeWhitespace(record.market) ? `Market: ${normalizeWhitespace(record.market)}` : "",
    normalizeWhitespace(record.owner) ? `Owner: ${normalizeWhitespace(record.owner)}` : "",
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 1900);
}

function buildNoteBody(record: LeadRecord, tags: string[]): string {
  const lines = [
    `Imported from ${normalizeWhitespace(record.source_system) || "Deal Automator"}`,
    `Lead ID: ${normalizeWhitespace(record.lead_id) || "n/a"}`,
    `Batch Date: ${normalizeWhitespace(record.batch_date) || "n/a"}`,
    `Market: ${normalizeWhitespace(record.market) || "n/a"}`,
    `Source File: ${normalizeWhitespace(record.source_file) || "n/a"}`,
    `Source Page: ${String(record.source_page ?? "") || "n/a"}`,
    `Page Range: ${normalizeWhitespace(record.page_range) || "n/a"}`,
    `Address: ${normalizeWhitespace(record.address) || "n/a"}`,
    `Owner: ${normalizeWhitespace(record.owner) || "n/a"}`,
    `Asset Summary: ${normalizeWhitespace(record.asset_summary) || "n/a"}`,
    `Tags: ${tags.join(", ") || "n/a"}`,
    `LTV: ${normalizeWhitespace(record.ltv) || "n/a"}`,
    `Market Value: ${normalizeWhitespace(record.market_value) || "n/a"}`,
    `Raw Text: ${normalizeWhitespace(record.raw_text) || "n/a"}`,
  ];
  return lines.join("\n");
}

async function ensureOrganizationAndActor(organizationSlug: string, actorEmail: string) {
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!organization) {
    throw new Error(`Organization not found: ${organizationSlug}`);
  }

  const actor = await prisma.user.findUnique({
    where: { email: actorEmail },
    select: { id: true, email: true, organizationId: true },
  });
  if (!actor) {
    throw new Error(`Actor user not found: ${actorEmail}`);
  }
  if (actor.organizationId !== organization.id) {
    throw new Error(`Actor ${actorEmail} does not belong to organization ${organizationSlug}`);
  }

  return { organization, actor };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = path.resolve(process.cwd(), args.file);
  const loaded = await loadRecords(sourceFile);
  const deduped = dedupeRecords(loaded);
  const selected = args.limit ? deduped.slice(0, args.limit) : deduped;
  const { organization, actor } = await ensureOrganizationAndActor(args.organizationSlug, args.actorEmail);

  const ownerCache = new Map<string, string>();
  const propertyCache = new Map<string, string>();

  const summary: ImportSummary = {
    sourceFile,
    dryRun: args.dryRun,
    totalLoaded: loaded.length,
    deduped: deduped.length,
    attempted: selected.length,
    skipped: 0,
    ownersCreated: 0,
    ownersReused: 0,
    propertiesCreated: 0,
    propertiesResolved: 0,
    externalIdsAttached: 0,
    opportunitiesCreated: 0,
    opportunitiesReused: 0,
    notesCreated: 0,
    errors: [],
  };

  for (let index = 0; index < selected.length; index += 1) {
    const record = selected[index];
    const leadId = normalizeWhitespace(record.lead_id) || `row-${index + 1}`;

    try {
      const tags = asTags(record);
      const parsedAddress = parseAddress(record.address, record.market);
      const facts = parsePropertyFacts(record, parsedAddress);

      let ownerId: string | null = null;
      const ownerName = normalizeWhitespace(record.owner);
      if (ownerName) {
        const matchKey = computeMatchKey({ displayName: ownerName });
        const cachedOwnerId = ownerCache.get(matchKey);
        if (cachedOwnerId) {
          ownerId = cachedOwnerId;
          summary.ownersReused += 1;
        } else if (!args.dryRun) {
          const existingOwner = await prisma.owner.findFirst({
            where: { organizationId: organization.id, matchKey, status: "ACTIVE" },
            select: { id: true },
          });
          if (existingOwner) {
            ownerId = existingOwner.id;
            summary.ownersReused += 1;
          } else {
            const createdOwner = await createOwner(organization.id, {
              displayName: ownerName,
              entityType: inferOwnerEntityType(ownerName),
              actorUserId: actor.id,
            });
            ownerId = createdOwner.id;
            summary.ownersCreated += 1;
          }
          ownerCache.set(matchKey, ownerId);
        }
      }

      const cachedPropertyId = propertyCache.get(leadId);
      let propertyId = cachedPropertyId ?? null;
      let opportunityId: string | null = null;

      if (!args.dryRun && !propertyId) {
        const existingExternal = await prisma.propertyExternalIdentifier.findFirst({
          where: {
            organizationId: organization.id,
            provider: args.provider,
            providerIdentifier: leadId,
            state: "ACTIVE",
          },
          select: { propertyId: true },
        });
        if (existingExternal) {
          propertyId = existingExternal.propertyId;
          summary.propertiesResolved += 1;
        }
      }

      if (!args.dryRun && !propertyId) {
        const resolved = await resolveOrCreateProperty(
          organization.id,
          {
            name: facts.propertyName,
            assetType: facts.assetType,
            status: facts.operationalStatus,
            addressLine1: parsedAddress.addressLine1,
            city: parsedAddress.city,
            state: parsedAddress.state,
            postalCode: parsedAddress.postalCode,
            county: null,
            sellerId: null,
            unitCount: facts.unitCount,
            acreage: facts.acreage,
            occupancyRate: null,
            noiAnnualUsd: null,
            askingPriceUsd: null,
            estimatedValueUsd: null,
            capRate: null,
          },
          {
            squareFeet: facts.squareFeet,
            addressNormalized: [parsedAddress.addressLine1, parsedAddress.city, parsedAddress.state, parsedAddress.postalCode ?? ""].join(" "),
          },
          {
            actorUserId: actor.id,
            method: "dealautomator-import",
            sourceCategory: "LICENSED",
            sourceId: "dealautomator",
            asOf: record.batch_date ? new Date(`${record.batch_date}T00:00:00.000Z`) : new Date(),
          },
        );
        propertyId = resolved.property.id;
        if (resolved.resolved) {
          summary.propertiesResolved += 1;
        } else {
          summary.propertiesCreated += 1;
        }
        await addPropertyExternalIdentifier(
          organization.id,
          propertyId,
          args.provider,
          leadId,
          record.batch_date ? new Date(`${record.batch_date}T00:00:00.000Z`) : null,
        );
        summary.externalIdsAttached += 1;
      }

      if (propertyId) {
        propertyCache.set(leadId, propertyId);
      }

      if (!args.dryRun && propertyId && ownerId) {
        await prisma.property.updateMany({
          where: { id: propertyId, organizationId: organization.id, ownerId: null },
          data: { ownerId },
        });
      }

      if (!args.dryRun && propertyId) {
        const title = buildOpportunityTitle(record, facts.propertyName);
        const existingOpportunity = await prisma.opportunity.findFirst({
          where: {
            organizationId: organization.id,
            propertyId,
            title,
            source: normalizeWhitespace(record.source_system) || "Deal Automator",
          },
          select: { id: true },
        });

        if (existingOpportunity) {
          opportunityId = existingOpportunity.id;
          summary.opportunitiesReused += 1;
        } else {
          const createdOpportunity = await prisma.opportunity.create({
            data: {
              organizationId: organization.id,
              propertyId,
              title,
              stage: OpportunityStage.LEAD,
              source: normalizeWhitespace(record.source_system) || "Deal Automator",
              priority: inferPriority(tags),
              summary: buildOpportunitySummary(record, tags),
            },
            select: { id: true },
          });
          opportunityId = createdOpportunity.id;
          summary.opportunitiesCreated += 1;

          await prisma.activityLog.create({
            data: {
              organizationId: organization.id,
              actorId: actor.id,
              propertyId,
              opportunityId,
              eventType: "opportunity.created",
              eventLabel: `Opportunity imported: ${title}`,
              eventBody: `Source: ${normalizeWhitespace(record.source_system) || "Deal Automator"} | Lead ID: ${leadId}`,
            },
          });
        }

        const noteBody = buildNoteBody(record, tags);
        const existingNote = await prisma.note.findFirst({
          where: {
            organizationId: organization.id,
            propertyId,
            opportunityId,
            body: noteBody,
          },
          select: { id: true },
        });
        if (!existingNote) {
          await prisma.note.create({
            data: {
              organizationId: organization.id,
              propertyId,
              opportunityId,
              authorId: actor.id,
              body: noteBody,
            },
          });
          summary.notesCreated += 1;
        }
      }

      if ((index + 1) % 250 === 0) {
        console.log(`Processed ${index + 1}/${selected.length}`);
      }
    } catch (error) {
      summary.skipped += 1;
      summary.errors.push({
        leadId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (args.summaryFile) {
    await fs.writeFile(args.summaryFile, JSON.stringify(summary, null, 2), "utf8");
  }
  await prisma.$disconnect();
}

// Pure parse/limit surface exported for tests. Importing this module has NO side effects;
// main() runs only when the file is executed directly (CLI), never on import.
export {
  loadRecords,
  parseDelimitedRecords,
  parseJsonRecords,
  SUPPORTED_EXTENSIONS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_COLUMNS,
  MAX_CELL_LENGTH,
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
}
