import { STOPS_PER_DAY } from "@/constants";
import type { RouteSegment } from "@/types";
import { distanceMeters } from "./distance";

export function findClosestRouteIndex(routeCoords: [number, number][], point: [number, number]): number {
	if (routeCoords.length === 0) return 0;
	let best = 0;
	let bestDist = distanceMeters(routeCoords[0], point);
	for (let i = 1; i < routeCoords.length; i++) {
		const d = distanceMeters(routeCoords[i], point);
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return best;
}

export function getRouteSegmentsByDay(
	routeCoords: [number, number][],
	markers: { coords: [number, number] }[],
	stopDays: number[]
): RouteSegment[] {
	if (routeCoords.length < 2 || markers.length < 2) return [];
	const indices = markers.map((m) => findClosestRouteIndex(routeCoords, m.coords));
	for (let i = 1; i < indices.length; i++) {
		if (indices[i] <= indices[i - 1]) indices[i] = Math.min(indices[i - 1] + 1, routeCoords.length - 1);
	}
	if (indices[indices.length - 1] >= routeCoords.length) indices[indices.length - 1] = routeCoords.length - 1;

	const segments: RouteSegment[] = [];
	for (let i = 0; i < markers.length - 1; i++) {
		const start = indices[i];
		const end = indices[i + 1];
		if (end > start && start < routeCoords.length) {
			const coords = routeCoords.slice(start, end + 1) as [number, number][];
			if (coords.length >= 2) {
				segments.push({
					coords,
					day: stopDays[i] ?? Math.floor(i / STOPS_PER_DAY) + 1,
				});
			}
		}
	}
	return segments;
}
