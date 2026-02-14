/** Haversine distance in meters between two [lng, lat] points. */
export function distanceMeters(a: [number, number], b: [number, number]): number {
	const R = 6371000;
	const [lng1, lat1] = a;
	const [lng2, lat2] = b;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const x =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
