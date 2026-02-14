/** Map marker / stop in the itinerary. */
export interface MarkerItem {
	id: string | number;
	label: string;
	coords: [number, number];
}

export type RouteMode = "road" | "optimized";

/** [south_lat, west_lon, north_lat, east_lon] for Overpass/Nominatim bbox. */
export type Bbox = [number, number, number, number];

/** Segment of route polyline with a day number for coloring. */
export interface RouteSegment {
	coords: [number, number][];
	day: number;
}
