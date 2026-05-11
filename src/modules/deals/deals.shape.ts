import type { Deal } from "../../db/schema";

export type OwnerMap = Map<string, { id: string; name: string }>;

export interface ShapedDeal extends Deal {
	owner: { id: string; name: string } | null;
	amountNumber: number;
}

export function shapeDeal(deal: Deal, owners?: OwnerMap): ShapedDeal {
	const owner = deal.ownerUserId
		? (owners?.get(deal.ownerUserId) ?? { id: deal.ownerUserId, name: "" })
		: null;
	const amountNumber = Number.parseFloat(deal.amount ?? "0") || 0;
	return { ...deal, owner, amountNumber };
}
