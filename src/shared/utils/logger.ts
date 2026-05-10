function ts(): string {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export const logger = {
	info: (...args: unknown[]) => console.log(ts(), ...args),
	error: (...args: unknown[]) => console.error(ts(), ...args),
	warn: (...args: unknown[]) => console.warn(ts(), ...args),
};
