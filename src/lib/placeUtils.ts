import type { Place, PlaceCategory } from "@/types";

export function placeMatchesType(place: Place, type: PlaceCategory | null): boolean {
	if (!type) return true;
	if (place.category === type) return true;
	const n = place.name.toLowerCase();
	if (type === "beaches" && (n.includes("beach") || n.includes("resort") || n.includes("island"))) return true;
	if (type === "mountains" && (n.includes("mountain") || n.includes("peak") || n.includes("hill") || n.includes("view"))) return true;
	if (type === "heritage" && (n.includes("church") || n.includes("temple") || n.includes("museum") || n.includes("heritage") || n.includes("monument"))) return true;
	return false;
}

export function placeCategoryTag(place: Place): string {
	if (place.category === "beaches") return "NATURE";
	if (place.category === "mountains") return "NATURE";
	if (place.category === "heritage") return "HERITAGE";
	if (place.placeType) {
		const t = place.placeType;
		return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ");
	}
	return "LANDMARK";
}
