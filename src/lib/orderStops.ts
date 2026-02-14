import { distanceMeters } from "./distance";

/** Order items by nearest-next from the first item (greedy TSP). */
export function orderByNearestFromStart<T extends { coords: [number, number] }>(items: T[]): T[] {
	if (items.length <= 2) return [...items];
	const [start, ...rest] = items;
	const ordered: T[] = [start];
	let remaining = [...rest];
	let current = start.coords;
	while (remaining.length > 0) {
		let bestIdx = 0;
		let bestDist = distanceMeters(current, remaining[0].coords);
		for (let i = 1; i < remaining.length; i++) {
			const d = distanceMeters(current, remaining[i].coords);
			if (d < bestDist) {
				bestDist = d;
				bestIdx = i;
			}
		}
		const next = remaining[bestIdx];
		ordered.push(next);
		remaining = remaining.filter((_, i) => i !== bestIdx);
		current = next.coords;
	}
	return ordered;
}
