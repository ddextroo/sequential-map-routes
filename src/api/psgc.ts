/**
 * Philippine Standard Geographic Code (PSGC) API
 * @see https://psgc.gitlab.io/api/
 */

const PSGC_BASE = "https://psgc.gitlab.io/api";

export interface PsgcProvince {
	code: string;
	name: string;
	regionCode: string;
	islandGroupCode: string;
	psgc10DigitCode: string;
}

/**
 * Fetch all provinces from PSGC. Use .json suffix for application/json response.
 */
export async function fetchProvinces(): Promise<PsgcProvince[]> {
	const res = await fetch(`${PSGC_BASE}/provinces.json`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) throw new Error(`PSGC: ${res.statusText}`);
	const data = await res.json();
	return Array.isArray(data) ? data : [];
}

/**
 * Return only provinces whose names are in the allowed set (e.g. our 5 with bboxes).
 */
export function filterProvincesByName(
	provinces: PsgcProvince[],
	allowedNames: string[]
): PsgcProvince[] {
	const set = new Set(allowedNames.map((n) => n.toLowerCase()));
	return provinces.filter((p) => set.has(p.name.toLowerCase()));
}
