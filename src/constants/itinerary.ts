import type { Bbox } from "@/types";
import type { PlaceCategory } from "@/types";

export const STOPS_PER_DAY = 1;

export const DAY_COLORS = [
	{ bg: "bg-blue-600", border: "border-blue-400", light: "bg-blue-50", text: "text-blue-700", hex: "#2563eb" },
	{ bg: "bg-emerald-600", border: "border-emerald-400", light: "bg-emerald-50", text: "text-emerald-700", hex: "#059669" },
	{ bg: "bg-amber-500", border: "border-amber-400", light: "bg-amber-50", text: "text-amber-700", hex: "#d97706" },
	{ bg: "bg-violet-600", border: "border-violet-400", light: "bg-violet-50", text: "text-violet-700", hex: "#7c3aed" },
	{ bg: "bg-rose-500", border: "border-rose-400", light: "bg-rose-50", text: "text-rose-700", hex: "#e11d48" },
] as const;

export function getDayColor(day: number) {
	return DAY_COLORS[(day - 1) % DAY_COLORS.length] ?? DAY_COLORS[0];
}

/** Bbox [south_lat, west_lon, north_lat, east_lon]. 5 provinces per region (PSGC). */
export const PROVINCE_BBOXES: Record<string, Bbox> = {
	// Luzon (5)
	Batangas: [13.5, 120.6, 14.2, 121.2],
	Cavite: [14.1, 120.3, 14.6, 121.0],
	Laguna: [13.9, 121.0, 14.4, 121.6],
	Pampanga: [14.8, 120.3, 15.2, 121.0],
	Rizal: [14.4, 121.0, 14.8, 121.5],
	// Visayas (5)
	Cebu: [10.18, 123.78, 10.42, 124.0],
	Bohol: [9.5, 123.5, 10.2, 124.2],
	"Negros Oriental": [9.1, 122.9, 10.0, 123.4],
	Siquijor: [9.1, 123.5, 9.2, 123.6],
	Iloilo: [10.5, 122.3, 11.2, 123.0],
	// Mindanao (5)
	Bukidnon: [7.5, 124.5, 8.5, 125.2],
	"Davao del Sur": [5.8, 125.2, 7.2, 126.0],
	"Misamis Oriental": [8.0, 124.5, 8.8, 125.2],
	"South Cotabato": [5.5, 124.2, 6.5, 125.5],
	"Zamboanga del Sur": [7.0, 122.0, 8.2, 122.8],
};

/** 5 province names per region for sidebar (order preserved for display). */
export const PROVINCES_BY_REGION: Record<"luzon" | "visayas" | "mindanao", string[]> = {
	luzon: ["Batangas", "Cavite", "Laguna", "Pampanga", "Rizal"],
	visayas: ["Cebu", "Bohol", "Negros Oriental", "Siquijor", "Iloilo"],
	mindanao: ["Bukidnon", "Davao del Sur", "Misamis Oriental", "South Cotabato", "Zamboanga del Sur"],
};

/** All supported province names (5 per region). Used with PSGC API. */
export const SUPPORTED_PROVINCE_NAMES = Object.keys(PROVINCE_BBOXES);

export const TYPE_FILTERS: { id: PlaceCategory; label: string }[] = [
	{ id: "beaches", label: "Beaches" },
	{ id: "mountains", label: "Mountains" },
	{ id: "heritage", label: "Heritage" },
];

/** Region id and display name; icon is resolved in UI via REGION_ICONS. */
export const REGIONS = [
	{ id: "luzon" as const, name: "Luzon", iconName: "mountain" as const },
	{ id: "visayas" as const, name: "Visayas", iconName: "waves" as const },
	{ id: "mindanao" as const, name: "Mindanao", iconName: "mountain" as const },
];
