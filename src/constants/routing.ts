import type { OSRMProfile } from "@/api/osrm";

export const PROFILE_LABELS: Record<OSRMProfile, string> = {
	driving: "Car",
	walking: "Walk",
	cycling: "Bike",
};
