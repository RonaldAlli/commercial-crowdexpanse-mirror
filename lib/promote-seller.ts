import type { ContactOutreachStatus } from "@prisma/client";

/**
 * "Promote qualified seller → opportunity" — the pure decision behind the button on
 * the seller detail page (Seller Acquisition vertical, Path A: existing seams only).
 *
 * Business rules:
 *  - Offered ONLY for a QUALIFIED seller (`Seller.outreachStatus`) to a user who may
 *    create opportunities (`can(role, "CREATE", "OPPORTUNITY")`).
 *  - An opportunity requires a property, so the destination depends on how many the
 *    seller has:
 *      0 properties → guide them to add one first (`/properties/new`)
 *      1 property   → seed the New-Opportunity form with the seller + that property
 *      many         → seed with the seller; the user picks which property
 *  - Every non-null result points at the EXISTING New-Opportunity form, which invokes
 *    the canonical `createOpportunity` path. This function computes only a link — it
 *    never creates, authorizes, validates, or logs (AC-PROMOTE-7). No pipeline, no
 *    stage semantics, no schema: pure presentation routing over existing behavior.
 *
 * Returns `null` when the control must not be shown.
 */
export type SellerPromotion = {
  mode: "add-property" | "preselect-property" | "choose-property";
  href: string;
  label: string;
};

export function resolveSellerPromotion(input: {
  canCreateOpportunity: boolean;
  outreachStatus: ContactOutreachStatus;
  sellerId: string;
  propertyIds: string[];
}): SellerPromotion | null {
  if (!input.canCreateOpportunity || input.outreachStatus !== "QUALIFIED") return null;

  const seller = encodeURIComponent(input.sellerId);

  if (input.propertyIds.length === 0) {
    return { mode: "add-property", href: "/properties/new", label: "Add a property to promote" };
  }

  if (input.propertyIds.length === 1) {
    const property = encodeURIComponent(input.propertyIds[0]);
    return {
      mode: "preselect-property",
      href: `/opportunities/new?sellerId=${seller}&propertyId=${property}`,
      label: "Promote to opportunity",
    };
  }

  return {
    mode: "choose-property",
    href: `/opportunities/new?sellerId=${seller}`,
    label: "Promote to opportunity",
  };
}
