export type PlaceCategory = "beaches" | "mountains" | "heritage";

export interface Place {
	id: string;
	name: string;
	coords: [number, number];
	imageUrl: string | null;
	wikipediaUrl: string;
	address?: string;
	category?: PlaceCategory;
	placeType?: string;
}
