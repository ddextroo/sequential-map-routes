/**
 * Search places, streets, suburbs, and addresses via OpenStreetMap Nominatim.
 * No API key required. Returns streets, suburbs, POIs, and addresses in one search.
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/
 */

import type { Place } from "@/types";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Bbox [south_lat, west_lon, north_lat, east_lon]. Viewbox = left,top,right,bottom = west,north,east,south */
function viewboxFromBbox(bbox: [number, number, number, number]): string {
	const [south, west, north, east] = bbox;
	return `${west},${north},${east},${south}`;
}

interface NominatimResult {
	place_id: number;
	lat: string;
	lon: string;
	display_name: string;
	type?: string;
	class?: string;
	name?: string;
	osm_type?: string;
	osm_id?: number;
}

/**
 * Search OpenStreetMap (Nominatim) by query string. Returns places, streets,
 * suburbs, addresses, and POIs within the Cebu bbox. No API key needed.
 */
export async function searchPlacesNominatim(
	query: string,
	bbox: [number, number, number, number]
): Promise<{ places: Place[]; error?: string }> {
	const q = query.trim();
	if (!q) {
		return { places: [] };
	}

	const params = new URLSearchParams({
		q,
		format: "json",
		addressdetails: "1",
		limit: "15",
		countrycodes: "ph",
		viewbox: viewboxFromBbox(bbox),
		bounded: "1",
	});

	const headers: HeadersInit = {
		Accept: "application/json",
		"User-Agent": "UbanGoPlanner/1.0 (Cebu trip planner; mailto:user@example.com)",
	};

	try {
		const res = await fetch(`${NOMINATIM_URL}?${params}`, { headers });
		if (!res.ok) {
			return { places: [], error: `Search failed: ${res.statusText}` };
		}
		const data = (await res.json()) as NominatimResult[];

		const places: Place[] = data.map((r) => {
			const lat = parseFloat(r.lat);
			const lon = parseFloat(r.lon);
			const name = r.name || r.display_name.split(",")[0]?.trim() || r.display_name;
			const osmType = r.osm_type ?? "node";
			const osmId = r.osm_id ?? r.place_id;
			const placeId = `osm:${osmType}:${osmId}`;
			const placeType = r.type || r.class || "place";

			return {
				id: placeId,
				name,
				coords: [lon, lat] as [number, number],
				imageUrl: null,
				wikipediaUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
				address: r.display_name,
				placeType,
			};
		});

		return { places };
	} catch (e) {
		return {
			places: [],
			error: e instanceof Error ? e.message : "Search failed",
		};
	}
}
