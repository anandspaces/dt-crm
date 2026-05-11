import type { Account } from "../../db/schema";

export type OwnerMap = Map<string, { id: string; name: string }>;
export type CountsMap = Map<string, { contacts: number; deals: number }>;

export interface ShapedAccount extends Account {
	owner: { id: string; name: string } | null;
	contactsCount: number;
	dealsCount: number;
}

export function shapeAccount(
	account: Account,
	owners?: OwnerMap,
	counts?: CountsMap,
): ShapedAccount {
	const owner = account.ownerUserId
		? (owners?.get(account.ownerUserId) ?? {
				id: account.ownerUserId,
				name: "",
			})
		: null;
	const c = counts?.get(account.id);
	return {
		...account,
		owner,
		contactsCount: c?.contacts ?? 0,
		dealsCount: c?.deals ?? 0,
	};
}
