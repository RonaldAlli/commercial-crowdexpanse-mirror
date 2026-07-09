// Shared mapping for a note's single polymorphic link across the four record types.

export type NoteLinkType = "seller" | "buyer" | "property" | "opportunity";

export const NOTE_LINK_TYPES: NoteLinkType[] = ["seller", "buyer", "property", "opportunity"];

export const NOTE_LINK_META: Record<NoteLinkType, { label: string; field: "sellerId" | "buyerId" | "propertyId" | "opportunityId"; hrefBase: string }> = {
  seller: { label: "Seller", field: "sellerId", hrefBase: "/sellers" },
  buyer: { label: "Buyer", field: "buyerId", hrefBase: "/buyers" },
  property: { label: "Property", field: "propertyId", hrefBase: "/properties" },
  opportunity: { label: "Opportunity", field: "opportunityId", hrefBase: "/opportunities" },
};

/** Derive display link info from a note row that included its relations. */
export function resolveNoteLink(note: {
  seller?: { id: string; name: string } | null;
  buyer?: { id: string; name: string } | null;
  property?: { id: string; name: string } | null;
  opportunity?: { id: string; title: string } | null;
}): { type: NoteLinkType; label: string; name: string; href: string } | null {
  if (note.seller) return { type: "seller", label: "Seller", name: note.seller.name, href: `/sellers/${note.seller.id}` };
  if (note.buyer) return { type: "buyer", label: "Buyer", name: note.buyer.name, href: `/buyers/${note.buyer.id}` };
  if (note.property) return { type: "property", label: "Property", name: note.property.name, href: `/properties/${note.property.id}` };
  if (note.opportunity) return { type: "opportunity", label: "Opportunity", name: note.opportunity.title, href: `/opportunities/${note.opportunity.id}` };
  return null;
}
