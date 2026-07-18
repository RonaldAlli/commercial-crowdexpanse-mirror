import Link from "next/link";
import { ContactMethod, ContactOutreachStatus, ContactTouchType } from "@prisma/client";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { contactMethodLabel, outreachStatusLabel, outreachStatusTone, touchTypeLabel } from "@/lib/contact-options";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { logContactTouchAction, updateContactOpsAction, type ContactKind } from "../../actions";

export const dynamic = "force-dynamic";

const CONTACT_METHOD_OPTIONS = Object.values(ContactMethod);
const OUTREACH_STATUS_OPTIONS = Object.values(ContactOutreachStatus);
const TOUCH_TYPE_OPTIONS = Object.values(ContactTouchType);

function dateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatDateTime(value: Date | null) {
  return value
    ? value.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}

function formatDate(value: Date | null) {
  return value
    ? value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
}

function isKind(value: string): value is ContactKind {
  return value === "owner" || value === "seller" || value === "buyer";
}

function telHref(phone: string | null) {
  return phone ? `tel:${phone}` : null;
}

function smsHref(phone: string | null) {
  return phone ? `sms:${phone}` : null;
}

function mailtoHref(email: string | null) {
  return email ? `mailto:${email}` : null;
}

function outreachScript(kind: ContactKind) {
  if (kind === "seller") {
    return {
      title: "Seller opener",
      objective: "Confirm motivation, collect facts, and move toward documents or a serious next step.",
      bullets: [
        "Hi, this is [Your Name] with CrowdExpanse. I’m calling about the property and wanted to see whether selling is something you are still open to.",
        "What is the current situation with the property right now, and what would make a sale helpful for you?",
        "Do you have an asking price, a timeline, and any recent numbers like rent roll, occupancy, or NOI?",
        "If it makes sense, can you send the T-12, rent roll, OM, taxes, insurance, and any other property materials?",
        "What is the best next step: another call, document review, or a written offer conversation?",
      ],
    };
  }

  if (kind === "owner") {
    return {
      title: "Owner / decision-maker opener",
      objective: "Get the right person engaged and secure the diligence package cleanly.",
      bullets: [
        "Hi, this is [Your Name] with CrowdExpanse. I’m following up on the property because we are reviewing it and need the right contact for documents.",
        "Are you the best person for financials and property-level decision making, or should I coordinate with someone else?",
        "We are looking for the current T-12, rent roll, OM, taxes, insurance, utilities, occupancy, and any recent capital expenditure details.",
        "What can you send today, and what will need a follow-up?",
        "What is the fastest way to stay in touch while we review everything?",
      ],
    };
  }

  return {
    title: "Buyer opener",
    objective: "Confirm buy box, timeline, and proof they can act when a match is ready.",
    bullets: [
      "Hi, this is [Your Name] with CrowdExpanse. I wanted to confirm what kinds of commercial deals you are actively looking for right now.",
      "Which markets, asset types, unit counts, and price ranges are the best fit for you today?",
      "How quickly can you review and respond when we send something that fits?",
      "What do you need to see first: OM, rent roll, underwriting summary, or a short deal memo?",
      "What is your preferred contact method and cadence for active opportunities?",
    ],
  };
}

function FlagBadges({
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

  if (flags.length === 0) {
    return <span className="text-sm text-slate-400">No restrictions flagged.</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <Badge key={flag.label} tone={flag.tone}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}

export default async function ContactWorkspacePage({
  params,
}: {
  params: { kind: string; id: string };
}) {
  const user = await requireUser();
  if (!isKind(params.kind)) notFound();

  const kind = params.kind;
  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId, lifecycleState: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let contact:
    | {
        id: string;
        displayName: string;
        subtitle: string | null;
        email: string | null;
        phone: string | null;
        mailingAddress: string | null;
        notes: string | null;
        recordHref: string;
        recordLabel: string;
        manageHref: string;
        outreachStatus: ContactOutreachStatus;
        preferredContactMethod: ContactMethod | null;
        nextFollowUpAt: Date | null;
        assignedUserId: string | null;
        assignedUserName: string | null;
        doNotCall: boolean;
        doNotEmail: boolean;
        doNotText: boolean;
        badPhone: boolean;
        badEmail: boolean;
        touchHistory: Array<{ id: string; type: ContactTouchType; summary: string | null; createdAt: Date; createdByName: string | null }>;
      }
    | null = null;

  if (kind === "owner") {
    if (!can(user.role, "READ", "OWNER")) notFound();
    const row = await prisma.ownerContact.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        owner: { select: { id: true, displayName: true } },
        assignedUser: { select: { id: true, name: true } },
        touchHistory: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    });
    if (!row) notFound();

    contact = {
      id: row.id,
      displayName: row.contactName ?? row.label ?? row.owner.displayName,
      subtitle: [row.label, row.company, row.isPrimary ? "Primary owner contact" : null].filter(Boolean).join(" · ") || null,
      email: row.email,
      phone: row.phone,
      mailingAddress: row.mailingAddress,
      notes: row.notes,
      recordHref: `/owners/${row.owner.id}`,
      recordLabel: row.owner.displayName,
      manageHref: `/owners/${row.owner.id}/contacts/${row.id}/edit`,
      outreachStatus: row.outreachStatus,
      preferredContactMethod: row.preferredContactMethod,
      nextFollowUpAt: row.nextFollowUpAt,
      assignedUserId: row.assignedUserId,
      assignedUserName: row.assignedUser?.name ?? null,
      doNotCall: row.doNotCall,
      doNotEmail: row.doNotEmail,
      doNotText: row.doNotText,
      badPhone: row.badPhone,
      badEmail: row.badEmail,
      touchHistory: row.touchHistory.map((touch) => ({
        id: touch.id,
        type: touch.type,
        summary: touch.summary,
        createdAt: touch.createdAt,
        createdByName: touch.createdBy?.name ?? null,
      })),
    };
  } else if (kind === "seller") {
    if (!can(user.role, "READ", "SELLER")) notFound();
    const row = await prisma.seller.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        owner: { select: { id: true, displayName: true } },
        assignedUser: { select: { id: true, name: true } },
        touchHistory: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    });
    if (!row) notFound();

    contact = {
      id: row.id,
      displayName: row.name,
      subtitle: [row.company, [row.city, row.state].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ") || null,
      email: row.email,
      phone: row.phone,
      mailingAddress: null,
      notes: row.motivation,
      recordHref: `/sellers/${row.id}`,
      recordLabel: row.name,
      manageHref: `/sellers/${row.id}/edit`,
      outreachStatus: row.outreachStatus,
      preferredContactMethod: row.preferredContactMethod,
      nextFollowUpAt: row.nextFollowUpAt,
      assignedUserId: row.assignedUserId,
      assignedUserName: row.assignedUser?.name ?? null,
      doNotCall: row.doNotCall,
      doNotEmail: row.doNotEmail,
      doNotText: row.doNotText,
      badPhone: row.badPhone,
      badEmail: row.badEmail,
      touchHistory: row.touchHistory.map((touch) => ({
        id: touch.id,
        type: touch.type,
        summary: touch.summary,
        createdAt: touch.createdAt,
        createdByName: touch.createdBy?.name ?? null,
      })),
    };
  } else {
    if (!can(user.role, "READ", "BUYER")) notFound();
    const row = await prisma.buyer.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        assignedUser: { select: { id: true, name: true } },
        touchHistory: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    });
    if (!row) notFound();

    contact = {
      id: row.id,
      displayName: row.name,
      subtitle: [row.company, row.targetStates.length ? `Markets: ${row.targetStates.join(", ")}` : null].filter(Boolean).join(" · ") || null,
      email: row.email,
      phone: row.phone,
      mailingAddress: null,
      notes: null,
      recordHref: `/buyers/${row.id}`,
      recordLabel: row.name,
      manageHref: `/buyers/${row.id}/edit`,
      outreachStatus: row.outreachStatus,
      preferredContactMethod: row.preferredContactMethod,
      nextFollowUpAt: row.nextFollowUpAt,
      assignedUserId: row.assignedUserId,
      assignedUserName: row.assignedUser?.name ?? null,
      doNotCall: row.doNotCall,
      doNotEmail: row.doNotEmail,
      doNotText: row.doNotText,
      badPhone: row.badPhone,
      badEmail: row.badEmail,
      touchHistory: row.touchHistory.map((touch) => ({
        id: touch.id,
        type: touch.type,
        summary: touch.summary,
        createdAt: touch.createdAt,
        createdByName: touch.createdBy?.name ?? null,
      })),
    };
  }

  const updateAction = updateContactOpsAction.bind(null, kind, contact.id);
  const logTouchAction = logContactTouchAction.bind(null, kind, contact.id);
  const lastTouch = contact.touchHistory[0] ?? null;
  const script = outreachScript(kind);
  const recentTouches = contact.touchHistory.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contact workspace"
        title={contact.displayName}
        description={contact.subtitle ?? `Manage outreach, follow-up, and history for this ${kind} contact.`}
        actions={
          <>
            <Link className="btn-ghost" href={contact.recordHref}>
              Open linked record
            </Link>
            <Link className="btn-ghost" href={contact.manageHref}>
              Edit source record
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-6">
          <article className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Outreach desk</p>
                <h2 className="text-base font-semibold text-slate-900">Everything needed while you are live with this contact</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Keep the script, contact details, context, recent history, and next step in view while the conversation is happening.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {telHref(contact.phone) ? (
                  <a className="btn-ghost" href={telHref(contact.phone) ?? "#"}>
                    Call now
                  </a>
                ) : null}
                {smsHref(contact.phone) ? (
                  <a className="btn-ghost" href={smsHref(contact.phone) ?? "#"}>
                    Text now
                  </a>
                ) : null}
                {mailtoHref(contact.email) ? (
                  <a className="btn-ghost" href={mailtoHref(contact.email) ?? "#"}>
                    Email now
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-900">{script.title}</p>
                <p className="mt-1 text-xs text-slate-500">{script.objective}</p>
                <ol className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">
                  {script.bullets.map((line, index) => (
                    <li key={line} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                        {index + 1}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">Live contact context</p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <dt className="text-xs text-slate-500">Best method</dt>
                      <dd className="mt-0.5 text-sm font-medium text-slate-900">{contactMethodLabel(contact.preferredContactMethod)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Status</dt>
                      <dd className="mt-0.5 text-sm font-medium text-slate-900">{outreachStatusLabel(contact.outreachStatus)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Next follow-up</dt>
                      <dd className="mt-0.5 text-sm font-medium text-slate-900">{formatDate(contact.nextFollowUpAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Assigned</dt>
                      <dd className="mt-0.5 text-sm font-medium text-slate-900">{contact.assignedUserName ?? "Unassigned"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">What to capture on this touch</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    <li>Motivation or current objective</li>
                    <li>Decision-maker and gatekeeper clarity</li>
                    <li>Timeline, pricing, and level of seriousness</li>
                    <li>Documents promised, missing, or refused</li>
                    <li>Exact next step and next follow-up date</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Context notes in view</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {contact.notes ?? "No context notes stored yet. Use the touch log below to capture what matters on this conversation."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Recent history in view</p>
                  <Badge tone="neutral">{recentTouches.length}</Badge>
                </div>
                {recentTouches.length > 0 ? (
                  <ul className="mt-3 space-y-3">
                    {recentTouches.map((touch) => (
                      <li key={touch.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="info">{touchTypeLabel(touch.type)}</Badge>
                          <span className="text-xs text-slate-400">{formatDateTime(touch.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-700">{touch.summary ?? "No summary recorded."}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">No prior outreach history yet.</p>
                )}
              </div>
            </div>
          </article>

          <article className="card p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={outreachStatusTone(contact.outreachStatus)}>{outreachStatusLabel(contact.outreachStatus)}</Badge>
              {contact.preferredContactMethod ? (
                <Badge tone="info">Best method: {contactMethodLabel(contact.preferredContactMethod)}</Badge>
              ) : null}
              {contact.assignedUserName ? <Badge tone="brand">Assigned: {contact.assignedUserName}</Badge> : null}
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">{contact.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">{contact.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Next follow-up</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">{formatDate(contact.nextFollowUpAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last touch</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">
                  {lastTouch ? `${touchTypeLabel(lastTouch.type)} · ${formatDateTime(lastTouch.createdAt)}` : "—"}
                </dd>
              </div>
              {contact.mailingAddress ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Mailing address</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{contact.mailingAddress}</dd>
                </div>
              ) : null}
              {contact.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500">Context notes</dt>
                  <dd className="mt-0.5 text-sm leading-relaxed text-slate-700">{contact.notes}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">Quick actions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {telHref(contact.phone) ? (
                  <a className="btn-ghost" href={telHref(contact.phone) ?? "#"}>
                    Call
                  </a>
                ) : null}
                {smsHref(contact.phone) ? (
                  <a className="btn-ghost" href={smsHref(contact.phone) ?? "#"}>
                    Text
                  </a>
                ) : null}
                {mailtoHref(contact.email) ? (
                  <a className="btn-ghost" href={mailtoHref(contact.email) ?? "#"}>
                    Email
                  </a>
                ) : null}
                <Link className="btn-ghost" href={contact.recordHref}>
                  Open record
                </Link>
              </div>
            </div>
          </article>

          <article className="card p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Touch history</p>
                <h2 className="text-base font-semibold text-slate-900">Every outreach touch on one timeline</h2>
              </div>
              <Badge tone="neutral">{contact.touchHistory.length}</Badge>
            </div>

            {contact.touchHistory.length > 0 ? (
              <ul className="mt-5 space-y-4">
                {contact.touchHistory.map((touch) => (
                  <li key={touch.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{touchTypeLabel(touch.type)}</Badge>
                      <span className="text-xs text-slate-400">{formatDateTime(touch.createdAt)}</span>
                      {touch.createdByName ? <span className="text-xs text-slate-500">by {touch.createdByName}</span> : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{touch.summary ?? "No summary recorded."}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-400">No touches logged yet.</p>
            )}
          </article>
        </div>

        <div className="space-y-6">
          <article className="card p-6">
            <p className="eyebrow">Outreach control</p>
            <h2 className="text-base font-semibold text-slate-900">Status, assignment, and follow-up</h2>
            <form action={updateAction} className="mt-5 space-y-4">
              <input type="hidden" name="redirectTo" value={`/contacts/${kind}/${contact.id}`} />

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Outreach status</span>
                <select name="outreachStatus" defaultValue={contact.outreachStatus} className="input">
                  {OUTREACH_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {outreachStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Best contact method</span>
                <select name="preferredContactMethod" defaultValue={contact.preferredContactMethod ?? ""} className="input">
                  <option value="">Not set</option>
                  {CONTACT_METHOD_OPTIONS.map((method) => (
                    <option key={method} value={method}>
                      {contactMethodLabel(method)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Assigned teammate</span>
                <select name="assignedUserId" defaultValue={contact.assignedUserId ?? ""} className="input">
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Next follow-up date</span>
                <input name="nextFollowUpAt" type="date" defaultValue={dateInputValue(contact.nextFollowUpAt)} className="input" />
              </label>

              <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="doNotCall" value="true" defaultChecked={contact.doNotCall} />
                  Do not call
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="doNotText" value="true" defaultChecked={contact.doNotText} />
                  Do not text
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="doNotEmail" value="true" defaultChecked={contact.doNotEmail} />
                  Do not email
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="badPhone" value="true" defaultChecked={contact.badPhone} />
                  Bad phone / wrong number
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="badEmail" value="true" defaultChecked={contact.badEmail} />
                  Bad email
                </label>
              </div>

              <button type="submit" className="btn-primary">
                Save outreach settings
              </button>
            </form>
          </article>

          <article className="card p-6">
            <p className="eyebrow">Log touch</p>
            <h2 className="text-base font-semibold text-slate-900">Record the latest call, text, email, or note</h2>
            <form action={logTouchAction} className="mt-5 space-y-4">
              <input type="hidden" name="redirectTo" value={`/contacts/${kind}/${contact.id}`} />

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Touch type</span>
                <select name="type" defaultValue={ContactTouchType.CALL} className="input">
                  {TOUCH_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {touchTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Summary</span>
                <textarea
                  name="summary"
                  className="input min-h-[120px] py-3"
                  placeholder="What happened, what they said, and what the next move is..."
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Update next follow-up</span>
                <input name="nextFollowUpAt" type="date" defaultValue={dateInputValue(contact.nextFollowUpAt)} className="input" />
              </label>

              <button type="submit" className="btn-primary">
                Log touch
              </button>
            </form>
          </article>

          <article className="card p-6">
            <p className="eyebrow">Restrictions</p>
            <h2 className="text-base font-semibold text-slate-900">Outreach safety flags</h2>
            <div className="mt-4">
              <FlagBadges
                doNotCall={contact.doNotCall}
                doNotEmail={contact.doNotEmail}
                doNotText={contact.doNotText}
                badPhone={contact.badPhone}
                badEmail={contact.badEmail}
              />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
