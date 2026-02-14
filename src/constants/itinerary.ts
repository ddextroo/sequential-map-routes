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

export const PROVINCE_BBOXES: Record<string, Bbox> = {
	Cebu: [10.18, 123.78, 10.42, 124.0],
	Bohol: [9.5, 123.5, 10.2, 124.2],
	"Negros Oriental": [9.1, 122.9, 10.0, 123.4],
	Siquijor: [9.1, 123.5, 9.2, 123.6],
};

export const PROVINCES_VISAYAS = ["Cebu", "Bohol", "Negros Oriental", "Siquijor"];

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
