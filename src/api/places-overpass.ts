/**
 * Fetch all categories/types from OpenStreetMap for a province bbox via Overpass API.
 * Returns amenities, shops, tourism, places (suburb, village, town), and named streets.
 * No API key. Usage: https://operations.osmfoundation.org/policies/overpass/
 */

import type { Bbox, Place } from "@/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function getCoords(el: OverpassElement): [number, number] | null {
	if (el.lat != null && el.lon != null) return [el.lon, el.lat];
	if (el.center) return [el.center.lon, el.center.lat];
	if (el.bounds) {
		const b = el.bounds;
		const lon = (b.minlon + b.maxlon) / 2;
		const lat = (b.minlat + b.maxlat) / 2;
		return [lon, lat];
	}
	return null;
}

function getPlaceType(el: OverpassElement): string {
	const t = el.tags ?? {};
	if (t.amenity) return t.amenity;
	if (t.shop) return t.shop;
	if (t.tourism) return t.tourism;
	if (t.place) return t.place;
	if (t.highway) return "street";
	if (t.building) return "building";
	return "place";
}

function getName(el: OverpassElement): string {
	const t = el.tags ?? {};
	return t.name ?? t["name:en"] ?? `Unnamed (${el.type}/${el.id})`;
}

/** Build full address from OSM addr:* tags when present. */
function getAddress(el: OverpassElement): string | undefined {
	const t = el.tags ?? {};
	const parts: string[] = [];
	if (t["addr:housenumber"]) parts.push(t["addr:housenumber"]);
	if (t["addr:street"]) parts.push(t["addr:street"]);
	if (t["addr:suburb"]) parts.push(t["addr:suburb"]);
	if (t["addr:city"] || t["addr:municipality"]) parts.push(t["addr:city"] ?? t["addr:municipality"]!);
	if (t["addr:state"]) parts.push(t["addr:state"]);
	if (t["addr:postcode"]) parts.push(t["addr:postcode"]);
	if (t["addr:country"]) parts.push(t["addr:country"]);
	if (parts.length === 0) return undefined;
	return parts.join(", ");
}

interface OverpassElement {
	type: "node" | "way" | "relation";
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	bounds?: { minlat: number; maxlat: number; minlon: number; maxlon: number };
	tags?: Record<string, string>;
}

interface OverpassResult {
	elements: OverpassElement[];
}

/**
 * Build Overpass QL query for all main categories in bbox.
 * bbox = [south, west, north, east]
 */
function buildQuery(bbox: Bbox): string {
	const [south, west, north, east] = bbox;
	const bboxStr = `(${south},${west},${north},${east})`;
	return `
[out:json][timeout:30];
(
  node["amenity"]["name"]${bboxStr};
  node["shop"]["name"]${bboxStr};
  node["tourism"]["name"]${bboxStr};
  node["place"]["name"]${bboxStr};
  way["amenity"]["name"]${bboxStr};
  way["shop"]["name"]${bboxStr};
  way["tourism"]["name"]${bboxStr};
  way["place"]["name"]${bboxStr};
  way["highway"]["name"]${bboxStr};
);
out center;
`.trim();
}

/**
 * Fetch all categories (amenities, shops, tourism, places, named streets) from OSM
 * for the given province bbox. Returns Place[] with placeType set.
 */
export async function fetchPlacesOverpass(bbox: Bbox): Promise<{ places: Place[]; error?: string }> {
	const query = buildQuery(bbox);
	const headers: HeadersInit = {
		Accept: "application/json",
		"User-Agent": "UbanGoPlanner/1.0 (Cebu trip planner)",
	};

	try {
		const res = await fetch(OVERPASS_URL, {
			method: "POST",
			headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
			body: `data=${encodeURIComponent(query)}`,
		});

		if (!res.ok) {
			return { places: [], error: `Overpass: ${res.statusText}` };
		}

		const data = (await res.json()) as OverpassResult;
		const seen = new Set<string>();
		const places: Place[] = [];

		for (const el of data.elements ?? []) {
			const coords = getCoords(el);
			if (!coords) continue;

			const name = getName(el);
			if (!name || name.startsWith("Unnamed")) continue;

			const id = `osm:${el.type}:${el.id}`;
			if (seen.has(id)) continue;
			seen.add(id);

			const placeType = getPlaceType(el);
			const address = getAddress(el);

			places.push({
				id,
				name,
				coords,
				imageUrl: null,
				wikipediaUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
				...(address && { address }),
				placeType,
			});
		}

		places.sort((a, b) => a.name.localeCompare(b.name));
		return { places };
	} catch (e) {
		return {
			places: [],
			error: e instanceof Error ? e.message : "Failed to fetch from OpenStreetMap",
		};
	}
}
