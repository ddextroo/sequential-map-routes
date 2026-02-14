/**
 * OSRM (Open Source Routing Machine) API helpers.
 * Uses the public demo server: https://router.project-osrm.org
 * No API key required. For production consider self-hosting or rate limits.
 */

const OSRM_BASE = "https://router.project-osrm.org";

export type OSRMProfile = "driving" | "walking" | "cycling";

/** Build coordinate string for OSRM: lng,lat;lng,lat;... */
function toCoordString(coords: [number, number][]): string {
	return coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
}

/** GeoJSON LineString from OSRM response */
function getGeometryFromRoute(route: {
	geometry?: { type: string; coordinates: [number, number][] };
}): [number, number][] {
	if (!route?.geometry?.coordinates?.length) return [];
	return route.geometry.coordinates;
}

/** Waypoint from OSRM (location is [lng, lat]) */
interface OSRMWaypoint {
	location: [number, number];
	waypoint_index: number;
	name?: string;
}

interface OSRMTripResult {
	code: string;
	waypoints?: OSRMWaypoint[];
	trips?: Array<{
		geometry?: { type: string; coordinates: [number, number][] };
		distance?: number;
		duration?: number;
	}>;
	message?: string;
}

interface OSRMRouteResult {
	code: string;
	waypoints?: Array<{ location: [number, number]; name?: string }>;
	routes?: Array<{
		geometry?: { type: string; coordinates: [number, number][] };
		distance?: number;
		duration?: number;
	}>;
	message?: string;
}

/**
 * Get optimized trip (TSP): best order of waypoints + road geometry.
 * Returns road coordinates and the optimized waypoint order.
 */
export async function getOptimizedTrip(
	coords: [number, number][],
	profile: OSRMProfile = "driving",
	roundtrip = true
): Promise<{
	routeCoords: [number, number][];
	orderedWaypoints: OSRMWaypoint[];
	distanceMeters?: number;
	durationSeconds?: number;
	error?: string;
}> {
	if (coords.length < 2) {
		return {
			routeCoords: [...coords],
			orderedWaypoints: coords.map((c, i) => ({ location: c, waypoint_index: i })),
		};
	}
	const coordStr = toCoordString(coords);
	const url = `${OSRM_BASE}/trip/v1/${profile}/${coordStr}?geometries=geojson&overview=full&roundtrip=${roundtrip}`;
	try {
		const res = await fetch(url);
		const data: OSRMTripResult = await res.json();
		if (data.code !== "Ok") {
			return {
				routeCoords: coords,
				orderedWaypoints: coords.map((c, i) => ({ location: c, waypoint_index: i })),
				error: data.message ?? data.code,
			};
		}
		const trip = data.trips?.[0];
		const routeCoords = trip ? getGeometryFromRoute(trip) : coords;
		const orderedWaypoints =
			data.waypoints?.slice().sort((a, b) => (a.waypoint_index ?? 0) - (b.waypoint_index ?? 0)) ??
			coords.map((c, i) => ({ location: c, waypoint_index: i }));
		return {
			routeCoords,
			orderedWaypoints,
			distanceMeters: trip?.distance,
			durationSeconds: trip?.duration,
		};
	} catch (e) {
		return {
			routeCoords: coords,
			orderedWaypoints: coords.map((c, i) => ({ location: c, waypoint_index: i })),
			error: e instanceof Error ? e.message : "Request failed",
		};
	}
}

/**
 * Get route through points in the given order, following roads.
 * Does not change the order of stops.
 */
export async function getRouteByRoad(
	coords: [number, number][],
	profile: OSRMProfile = "driving"
): Promise<{
	routeCoords: [number, number][];
	distanceMeters?: number;
	durationSeconds?: number;
	error?: string;
}> {
	if (coords.length < 2) {
		return { routeCoords: [...coords] };
	}
	const coordStr = toCoordString(coords);
	const url = `${OSRM_BASE}/route/v1/${profile}/${coordStr}?geometries=geojson&overview=full`;
	try {
		const res = await fetch(url);
		const data: OSRMRouteResult = await res.json();
		if (data.code !== "Ok") {
			return {
				routeCoords: coords,
				error: data.message ?? data.code,
			};
		}
		const route = data.routes?.[0];
		const routeCoords = route ? getGeometryFromRoute(route) : coords;
		return {
			routeCoords,
			distanceMeters: route?.distance,
			durationSeconds: route?.duration,
		};
	} catch (e) {
		return {
			routeCoords: coords,
			error: e instanceof Error ? e.message : "Request failed",
		};
	}
}
