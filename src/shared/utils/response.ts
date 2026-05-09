import type { Response } from "express";

export function ok<T>(res: Response, data: T, message = "OK"): void {
	res.status(200).json({ status: 200, message, data });
}

export function created<T>(res: Response, data: T, message = "Created"): void {
	res.status(201).json({ status: 201, message, data });
}

export function noContent(res: Response): void {
	res.status(204).send();
}

export function fail(
	res: Response,
	httpStatus: number,
	message: string,
	data?: unknown,
): void {
	res
		.status(httpStatus)
		.json({ status: httpStatus, message, data: data ?? null });
}
