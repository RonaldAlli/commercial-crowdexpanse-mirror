import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/empty-state";
import { HardLink } from "@/components/hard-link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { contactMethodLabel, outreachStatusLabel, outreachStatusTone, touchTypeLabel } from "@/lib/contact-options";
import { LIST_MIN_QUERY, ilike, totalPages } from "@/lib/list-params";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
const QUEUE_OPTIONS = [
  { value: "all", label: "All contacts" },
  { value: "today", label: "Follow up today" },
  { value: "new", label: "New" },
  { value: "responded", label: "Responded" },
  { value: "qualified", label: "Qualified" },
  { value: "dnc", label: "Do not contact" },
] as const;

type QueueValue = (typeof QUEUE_OPTIONS)[number]["value"];

function parsePage(value?: string) {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

function buildQueryString(
  current: { q?: string; queue?: QueueValue; ownersPage?: number; sellersPage?: number; buyersPage?: number },
  updates: Partial<{ q: string; queue: QueueValue; ownersPage: number; sellersPage: number; buyersPage: number }>,
) {
  const params = new URLSearchParams();
  const next = { ...current, ...updates };

  if (next.q) params.set("q", next.q);
  if (next.queue && next.queue !== "all") params.set("queue", next.queue);
  if ((next.ownersPage ?? 1) > 1) params.set("ownersPage", String(next.ownersPage));
  if ((next.sellersPage ?? 1) > 1) params.set("sellersPage", String(next.sellersPage));
  if ((next.buyersPage ?? 1) > 1) params.set("buyersPage", String(next.buyersPage));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function Pagination({
  page,
  pages,
  previousHref,
  nextHref,
}: {
  page: number;
  pages: number;
  previousHref: string;
  nextHref: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn-ghost" href={previousHref}>
            Previous
          </Link>
        ) : (
          <span className="btn-ghost cursor-not-allowed opacity-40">Previous</span>
        )}
        {page < pages ? (
          <Link className="btn-ghost" href={nextHref}>
            Next
          </Link>
        ) : (
          <span className="btn-ghost cursor-not-allowed opacity-40">Next</span>
        )}
      </div>
    </div>
  );
}

function formatFollowUp(value: Date | null) {
  return value
    ? value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
}

function isOverdue(value: Date | null) {
  if (!value) return false;
  const today = new Date();
  const due = new Date(value);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function QuickActions({
  email,
  phone,
  manageHref,
}: {
  email: string | null;
  phone: string | null;
  manageHref: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone}`} className="text-xs font-medium text-brand-700 hover:underline">
          Call
        </a>
      ) : null}
      {phone ? (
        <a href={`sms:${phone}`} className="text-xs font-medium text-brand-700 hover:underline">
          Text
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className="text-xs font-medium text-brand-700 hover:underline">
          Email
        </a>
      ) : null}
      <Link href={manageHref} className="text-xs font-medium text-brand-700 hover:underline">
        Manage
      </Link>
    </div>
  );
}

function FlagStack({
  doNotCall,
  doNotEmail,
  doNotText,
  badPhone,
  badEmail,
}: {
  doNotCall: boolean;
  doNotEmail: boolean;
  doNotText: boolean;
  badPhone: boolean;
  badEmail: boolean;
}) {
  const flags = [
    doNotCall ? { label: "No call", tone: "danger" as const } : null,
    doNotEmail ? { label: "No email", tone: "danger" as const } : null,
    doNotText ? { label: "No text", tone: "danger" as const } : null,
    badPhone ? { label: "Bad phone", tone: "warning" as const } : null,
    badEmail ? { label: "Bad email", tone: "warning" as const } : null,
  ].filter(Boolean) as Array<{ label: string; tone: "danger" | "warning" }>;

  return flags.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <Badge key={flag.label} tone={flag.tone}>
          {flag.label}
        </Badge>
      ))}
    </div>
  ) : (
    <span className="text-slate-400">—</span>
  );
}

function parseQueue(value?: string): QueueValue {
  return QUEUE_OPTIONS.some((option) => option.value === value) ? (value as QueueValue) : "all";
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; queue?: string; ownersPage?: string; sellersPage?: string; buyersPage?: string };
}) {
  const user = await requireUser();

  const q = (searchParams.q ?? "").trim();
  const hasQuery = q.length >= LIST_MIN_QUERY;
  const queue = parseQueue(searchParams.queue);
  const ownersPage = parsePage(searchParams.ownersPage);
  const sellersPage = parsePage(searchParams.sellersPage);
  const buyersPage = parsePage(searchParams.buyersPage);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const canReadOwnerContacts = can(user.role, "READ", "OWNER");
  const canReadSellers = can(user.role, "READ", "SELLER");
  const canReadBuyers = can(user.role, "READ", "BUYER");

  const ownerWhere: Prisma.OwnerContactWhereInput = { organizationId: user.organizationId };
  if (hasQuery) {
    ownerWhere.OR = [
      { owner: { displayName: ilike(q) } },
      { contactName: ilike(q) },
      { label: ilike(q) },
      { company: ilike(q) },
      { email: ilike(q) },
      { phone: ilike(q) },
      { mailingAddress: ilike(q) },
      { notes: ilike(q) },
    ];
  }
  if (queue === "today") {
    ownerWhere.nextFollowUpAt = { lte: today };
  } else if (queue === "new") {
    ownerWhere.outreachStatus = "NEW";
  } else if (queue === "responded") {
    ownerWhere.outreachStatus = "RESPONDED";
  } else if (queue === "qualified") {
    ownerWhere.outreachStatus = "QUALIFIED";
  } else if (queue === "dnc") {
    ownerWhere.AND = [{ OR: [{ outreachStatus: "DO_NOT_CONTACT" }, { doNotCall: true }, { doNotEmail: true }, { doNotText: true }] }];
  }

  const sellerWhere: Prisma.SellerWhereInput = {
    organizationId: user.organizationId,
  };
  if (hasQuery) {
    sellerWhere.AND = [
      {
        OR: [
          { name: ilike(q) },
          { company: ilike(q) },
          { email: ilike(q) },
          { phone: ilike(q) },
          { city: ilike(q) },
          { state: ilike(q) },
          { motivation: ilike(q) },
        ],
      },
    ];
  }
  if (queue === "today") {
    sellerWhere.nextFollowUpAt = { lte: today };
  } else if (queue === "new") {
    sellerWhere.outreachStatus = "NEW";
  } else if (queue === "responded") {
    sellerWhere.outreachStatus = "RESPONDED";
  } else if (queue === "qualified") {
    sellerWhere.outreachStatus = "QUALIFIED";
  } else if (queue === "dnc") {
    sellerWhere.AND = [{ OR: [{ outreachStatus: "DO_NOT_CONTACT" }, { doNotCall: true }, { doNotEmail: true }, { doNotText: true }] }];
  }

  const buyerWhere: Prisma.BuyerWhereInput = {
    organizationId: user.organizationId,
    OR: [{ email: { not: null } }, { phone: { not: null } }],
  };
  if (hasQuery) {
    buyerWhere.AND = [
      {
        OR: [
          { name: ilike(q) },
          { company: ilike(q) },
          { email: ilike(q) },
          { phone: ilike(q) },
        ],
      },
    ];
  }
  if (queue === "today") {
    buyerWhere.nextFollowUpAt = { lte: today };
  } else if (queue === "new") {
    buyerWhere.outreachStatus = "NEW";
  } else if (queue === "responded") {
    buyerWhere.outreachStatus = "RESPONDED";
  } else if (queue === "qualified") {
    buyerWhere.outreachStatus = "QUALIFIED";
  } else if (queue === "dnc") {
    buyerWhere.AND = [{ OR: [{ outreachStatus: "DO_NOT_CONTACT" }, { doNotCall: true }, { doNotEmail: true }, { doNotText: true }] }];
  }

  const [ownerContactsTotal, ownerContacts, sellersTotal, sellers, buyersTotal, buyers] =
    await Promise.all([
      canReadOwnerContacts ? prisma.ownerContact.count({ where: ownerWhere }) : Promise.resolve(0),
      canReadOwnerContacts
        ? prisma.ownerContact.findMany({
            where: ownerWhere,
            select: {
              id: true,
              label: true,
              contactName: true,
              company: true,
              email: true,
              phone: true,
              isPrimary: true,
              outreachStatus: true,
              preferredContactMethod: true,
              nextFollowUpAt: true,
              doNotCall: true,
              doNotEmail: true,
              doNotText: true,
              badPhone: true,
              badEmail: true,
              owner: { select: { id: true, displayName: true } },
              assignedUser: { select: { name: true } },
              touchHistory: {
                select: { type: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
            orderBy: [{ nextFollowUpAt: "asc" }, { isPrimary: "desc" }, { createdAt: "desc" }],
            skip: (ownersPage - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          })
        : Promise.resolve([]),
      canReadSellers ? prisma.seller.count({ where: sellerWhere }) : Promise.resolve(0),
      canReadSellers
        ? prisma.seller.findMany({
            where: sellerWhere,
            select: {
              id: true,
              name: true,
              company: true,
              email: true,
              phone: true,
              city: true,
              state: true,
              outreachStatus: true,
              preferredContactMethod: true,
              nextFollowUpAt: true,
              doNotCall: true,
              doNotEmail: true,
              doNotText: true,
              badPhone: true,
              badEmail: true,
              owner: { select: { id: true, displayName: true } },
              assignedUser: { select: { name: true } },
              touchHistory: {
                select: { type: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
            orderBy: [{ nextFollowUpAt: "asc" }, { name: "asc" }],
            skip: (sellersPage - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          })
        : Promise.resolve([]),
      canReadBuyers ? prisma.buyer.count({ where: buyerWhere }) : Promise.resolve(0),
      canReadBuyers
        ? prisma.buyer.findMany({
            where: buyerWhere,
            select: {
              id: true,
              name: true,
              company: true,
              email: true,
              phone: true,
              targetStates: true,
              outreachStatus: true,
              preferredContactMethod: true,
              nextFollowUpAt: true,
              doNotCall: true,
              doNotEmail: true,
              doNotText: true,
              badPhone: true,
              badEmail: true,
              assignedUser: { select: { name: true } },
              touchHistory: {
                select: { type: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
            orderBy: [{ nextFollowUpAt: "asc" }, { name: "asc" }],
            skip: (buyersPage - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          })
        : Promise.resolve([]),
    ]);

  const ownerPages = totalPages(ownerContactsTotal, PAGE_SIZE);
  const sellerPages = totalPages(sellersTotal, PAGE_SIZE);
  const buyerPages = totalPages(buyersTotal, PAGE_SIZE);
  const totalVisibleContacts = ownerContactsTotal + sellersTotal + buyersTotal;
  const followUpsDue =
    ownerContacts.filter((contact) => isOverdue(contact.nextFollowUpAt)).length +
    sellers.filter((seller) => isOverdue(seller.nextFollowUpAt)).length +
    buyers.filter((buyer) => isOverdue(buyer.nextFollowUpAt)).length;

  const currentParams = { q: hasQuery ? q : undefined, queue, ownersPage, sellersPage, buyersPage };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contact directory"
        title="Contacts"
        description="All stored contacts, grouped by owners, sellers, and buyers so outreach, follow-up, and deal movement stay organized."
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
          Search contacts
          <input
            className="input h-9 py-0 text-sm"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, company, owner, email, phone, notes, or market..."
          />
        </label>
        <button type="submit" className="btn">
          Apply
        </button>
        {hasQuery ? (
          <Link href="/contacts" className="btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {QUEUE_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={buildQueryString({ q: hasQuery ? q : undefined, queue: option.value, ownersPage: 1, sellersPage: 1, buyersPage: 1 }, { queue: option.value, ownersPage: 1, sellersPage: 1, buyersPage: 1 })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
              queue === option.value
                ? "bg-brand-50 text-brand-700 ring-brand-100"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Visible contacts</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{totalVisibleContacts}</p>
          <p className="mt-1 text-sm text-slate-500">Across the groups you can access.</p>
        </article>
        <article className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Follow-ups due</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{followUpsDue}</p>
          <p className="mt-1 text-sm text-slate-500">Contacts that should be worked now.</p>
        </article>
        {canReadOwnerContacts ? (
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Owner contacts</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{ownerContactsTotal}</p>
            <p className="mt-1 text-sm text-slate-500">Decision-makers stored on canonical owners.</p>
          </article>
        ) : null}
        {canReadSellers ? (
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Seller contacts</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{sellersTotal}</p>
            <p className="mt-1 text-sm text-slate-500">Direct seller records with contact methods stored.</p>
          </article>
        ) : null}
        {canReadBuyers ? (
          <article className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Buyer contacts</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{buyersTotal}</p>
            <p className="mt-1 text-sm text-slate-500">Capital partners ready for outreach.</p>
          </article>
        ) : null}
      </div>

      <article className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Pipeline handoff</p>
            <h2 className="text-base font-semibold text-slate-900">How contacts feed the commercial pipeline</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Work outreach here first, then move qualified conversations into opportunity-level seller pursuit and document collection.
            </p>
          </div>
          <HardLink href="/opportunities" className="btn-ghost">
            Open opportunities
          </HardLink>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">1. Outreach queue</p>
            <p className="mt-2 text-sm font-medium text-slate-900">Call, text, or email owners, sellers, and buyers from the due queues.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">2. Seller pursuit</p>
            <p className="mt-2 text-sm font-medium text-slate-900">Once a seller is real, manage the relationship on the opportunity page.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">3. Pre-contract docs</p>
            <p className="mt-2 text-sm font-medium text-slate-900">Request T-12, rent roll, OM, taxes, utilities, and insurance before underwriting.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">4. Closing center</p>
            <p className="mt-2 text-sm font-medium text-slate-900">After contract, escrow, financing, assignment, and checklist execution take over.</p>
          </div>
        </div>
      </article>

      {totalVisibleContacts === 0 ? (
        <div className="card">
          <EmptyState
            icon="buyers"
            title={hasQuery ? "No contacts match" : "No contacts stored yet"}
            description={
              hasQuery
                ? `Nothing matched "${q}". Try a different search or clear it.`
                : "Contacts will appear here as owner contacts, sellers, and buyers are added to the workspace."
            }
            action={hasQuery ? <Link className="btn-primary" href="/contacts">Clear search</Link> : null}
          />
        </div>
      ) : null}

      {canReadOwnerContacts ? (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Owner contacts</h2>
              <p className="text-xs text-slate-500">Primary and supporting decision-maker contacts attached to owner records.</p>
            </div>
            <Badge tone="brand">{ownerContactsTotal}</Badge>
          </div>
          {ownerContacts.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] border-collapse">
                  <thead className="border-b border-slate-200 bg-slate-50/60">
                    <tr>
                      <th className="table-head">Contact</th>
                      <th className="table-head">Owner</th>
                      <th className="table-head">Status</th>
                      <th className="table-head">Assigned</th>
                      <th className="table-head">Last touch</th>
                      <th className="table-head">Next follow-up</th>
                      <th className="table-head">Best method</th>
                      <th className="table-head">Flags</th>
                      <th className="table-head">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ownerContacts.map((contact) => {
                      const lastTouch = contact.touchHistory[0] ?? null;
                      return (
                        <tr key={contact.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="table-cell">
                            <Link href={`/contacts/owner/${contact.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                              {contact.contactName ?? contact.label ?? "Primary owner contact"}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {contact.isPrimary ? <Badge tone="success">Primary</Badge> : null}
                              {contact.label ? <span className="text-xs text-slate-500">{contact.label}</span> : null}
                              {contact.company ? <span className="text-xs text-slate-500">{contact.company}</span> : null}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              {contact.email ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="mail" className="h-3.5 w-3.5 text-slate-400" />
                                  {contact.email}
                                </p>
                              ) : null}
                              {contact.phone ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="phone" className="h-3.5 w-3.5 text-slate-400" />
                                  {contact.phone}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="table-cell">
                            <Link href={`/owners/${contact.owner.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                              {contact.owner.displayName}
                            </Link>
                          </td>
                          <td className="table-cell">
                            <Badge tone={outreachStatusTone(contact.outreachStatus)}>{outreachStatusLabel(contact.outreachStatus)}</Badge>
                          </td>
                          <td className="table-cell">{contact.assignedUser?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                          <td className="table-cell whitespace-nowrap">
                            {lastTouch ? (
                              <div>
                                <p className="text-sm font-medium text-slate-900">{touchTypeLabel(lastTouch.type)}</p>
                                <p className="text-xs text-slate-500">{formatFollowUp(lastTouch.createdAt)}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            <span className={isOverdue(contact.nextFollowUpAt) ? "font-medium text-rose-600" : "text-slate-700"}>
                              {formatFollowUp(contact.nextFollowUpAt)}
                            </span>
                          </td>
                          <td className="table-cell">{contactMethodLabel(contact.preferredContactMethod)}</td>
                          <td className="table-cell">
                            <FlagStack
                              doNotCall={contact.doNotCall}
                              doNotEmail={contact.doNotEmail}
                              doNotText={contact.doNotText}
                              badPhone={contact.badPhone}
                              badEmail={contact.badEmail}
                            />
                          </td>
                          <td className="table-cell">
                            <QuickActions
                              email={contact.email}
                              phone={contact.phone}
                              manageHref={`/contacts/owner/${contact.id}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={ownersPage}
                pages={ownerPages}
                previousHref={buildQueryString(currentParams, { ownersPage: ownersPage - 1 })}
                nextHref={buildQueryString(currentParams, { ownersPage: ownersPage + 1 })}
              />
            </>
          ) : (
            <div className="px-5 py-6 text-sm text-slate-400">
              {hasQuery ? "No owner contacts matched this search." : "No owner contacts stored yet."}
            </div>
          )}
        </section>
      ) : null}

      {canReadSellers ? (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Seller contacts</h2>
              <p className="text-xs text-slate-500">Direct seller outreach records with assignment, status, and follow-up tracking.</p>
            </div>
            <Badge tone="brand">{sellersTotal}</Badge>
          </div>
          {sellers.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] border-collapse">
                  <thead className="border-b border-slate-200 bg-slate-50/60">
                    <tr>
                      <th className="table-head">Seller</th>
                      <th className="table-head">Company / market</th>
                      <th className="table-head">Status</th>
                      <th className="table-head">Assigned</th>
                      <th className="table-head">Last touch</th>
                      <th className="table-head">Next follow-up</th>
                      <th className="table-head">Best method</th>
                      <th className="table-head">Flags</th>
                      <th className="table-head">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sellers.map((seller) => {
                      const lastTouch = seller.touchHistory[0] ?? null;
                      return (
                        <tr key={seller.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="table-cell">
                            <Link href={`/contacts/seller/${seller.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                              {seller.name}
                            </Link>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              {seller.email ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="mail" className="h-3.5 w-3.5 text-slate-400" />
                                  {seller.email}
                                </p>
                              ) : null}
                              {seller.phone ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="phone" className="h-3.5 w-3.5 text-slate-400" />
                                  {seller.phone}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="table-cell">
                            <p className="text-slate-700">{seller.company ?? "—"}</p>
                            <p className="mt-1 text-xs text-slate-500">{[seller.city, seller.state].filter(Boolean).join(", ") || "No market set"}</p>
                            {seller.owner ? (
                              <p className="mt-2 text-xs text-slate-500">
                                Linked owner:{" "}
                                <Link href={`/owners/${seller.owner.id}`} className="font-medium text-brand-700 hover:underline">
                                  {seller.owner.displayName}
                                </Link>
                              </p>
                            ) : null}
                          </td>
                          <td className="table-cell">
                            <Badge tone={outreachStatusTone(seller.outreachStatus)}>{outreachStatusLabel(seller.outreachStatus)}</Badge>
                          </td>
                          <td className="table-cell">{seller.assignedUser?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                          <td className="table-cell whitespace-nowrap">
                            {lastTouch ? (
                              <div>
                                <p className="text-sm font-medium text-slate-900">{touchTypeLabel(lastTouch.type)}</p>
                                <p className="text-xs text-slate-500">{formatFollowUp(lastTouch.createdAt)}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            <span className={isOverdue(seller.nextFollowUpAt) ? "font-medium text-rose-600" : "text-slate-700"}>
                              {formatFollowUp(seller.nextFollowUpAt)}
                            </span>
                          </td>
                          <td className="table-cell">{contactMethodLabel(seller.preferredContactMethod)}</td>
                          <td className="table-cell">
                            <FlagStack
                              doNotCall={seller.doNotCall}
                              doNotEmail={seller.doNotEmail}
                              doNotText={seller.doNotText}
                              badPhone={seller.badPhone}
                              badEmail={seller.badEmail}
                            />
                          </td>
                          <td className="table-cell">
                            <QuickActions
                              email={seller.email}
                              phone={seller.phone}
                              manageHref={`/contacts/seller/${seller.id}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={sellersPage}
                pages={sellerPages}
                previousHref={buildQueryString(currentParams, { sellersPage: sellersPage - 1 })}
                nextHref={buildQueryString(currentParams, { sellersPage: sellersPage + 1 })}
              />
            </>
          ) : (
            <div className="px-5 py-6 text-sm text-slate-400">
              {hasQuery ? "No seller contacts matched this search." : "No seller records with contact info yet."}
            </div>
          )}
        </section>
      ) : null}

      {canReadBuyers ? (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Buyer contacts</h2>
              <p className="text-xs text-slate-500">Capital partners with direct contact methods, assignment, and follow-up tracking.</p>
            </div>
            <Badge tone="brand">{buyersTotal}</Badge>
          </div>
          {buyers.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1260px] border-collapse">
                  <thead className="border-b border-slate-200 bg-slate-50/60">
                    <tr>
                      <th className="table-head">Buyer</th>
                      <th className="table-head">Company / markets</th>
                      <th className="table-head">Status</th>
                      <th className="table-head">Assigned</th>
                      <th className="table-head">Last touch</th>
                      <th className="table-head">Next follow-up</th>
                      <th className="table-head">Best method</th>
                      <th className="table-head">Flags</th>
                      <th className="table-head">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {buyers.map((buyer) => {
                      const lastTouch = buyer.touchHistory[0] ?? null;
                      return (
                        <tr key={buyer.id} className="transition-colors hover:bg-slate-50/60">
                          <td className="table-cell">
                            <Link href={`/contacts/buyer/${buyer.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                              {buyer.name}
                            </Link>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              {buyer.email ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="mail" className="h-3.5 w-3.5 text-slate-400" />
                                  {buyer.email}
                                </p>
                              ) : null}
                              {buyer.phone ? (
                                <p className="flex items-center gap-1.5">
                                  <Icon name="phone" className="h-3.5 w-3.5 text-slate-400" />
                                  {buyer.phone}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="table-cell">
                            <p className="text-slate-700">{buyer.company ?? "—"}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {buyer.targetStates.length > 0 ? buyer.targetStates.join(", ") : "No target markets"}
                            </p>
                          </td>
                          <td className="table-cell">
                            <Badge tone={outreachStatusTone(buyer.outreachStatus)}>{outreachStatusLabel(buyer.outreachStatus)}</Badge>
                          </td>
                          <td className="table-cell">{buyer.assignedUser?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                          <td className="table-cell whitespace-nowrap">
                            {lastTouch ? (
                              <div>
                                <p className="text-sm font-medium text-slate-900">{touchTypeLabel(lastTouch.type)}</p>
                                <p className="text-xs text-slate-500">{formatFollowUp(lastTouch.createdAt)}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="table-cell whitespace-nowrap">
                            <span className={isOverdue(buyer.nextFollowUpAt) ? "font-medium text-rose-600" : "text-slate-700"}>
                              {formatFollowUp(buyer.nextFollowUpAt)}
                            </span>
                          </td>
                          <td className="table-cell">{contactMethodLabel(buyer.preferredContactMethod)}</td>
                          <td className="table-cell">
                            <FlagStack
                              doNotCall={buyer.doNotCall}
                              doNotEmail={buyer.doNotEmail}
                              doNotText={buyer.doNotText}
                              badPhone={buyer.badPhone}
                              badEmail={buyer.badEmail}
                            />
                          </td>
                          <td className="table-cell">
                            <QuickActions
                              email={buyer.email}
                              phone={buyer.phone}
                              manageHref={`/contacts/buyer/${buyer.id}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={buyersPage}
                pages={buyerPages}
                previousHref={buildQueryString(currentParams, { buyersPage: buyersPage - 1 })}
                nextHref={buildQueryString(currentParams, { buyersPage: buyersPage + 1 })}
              />
            </>
          ) : (
            <div className="px-5 py-6 text-sm text-slate-400">
              {hasQuery ? "No buyer contacts matched this search." : "No buyer records with contact info yet."}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
