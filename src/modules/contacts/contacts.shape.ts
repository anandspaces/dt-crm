import type { Contact } from "../../db/schema";

export type OwnerMap = Map<string, { id: string; name: string }>;

export interface ShapedContact extends Contact {
	owner: { id: string; name: string } | null;
}

export function shapeContact(
	contact: Contact,
	owners?: OwnerMap,
): ShapedContact {
	const owner = contact.ownerUserId
		? (owners?.get(contact.ownerUserId) ?? {
				id: contact.ownerUserId,
				name: "",
			})
		: null;
	return { ...contact, owner };
}
