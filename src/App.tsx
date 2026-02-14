import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Map,
	MapControls,
	MapMarker,
	MarkerContent,
	MarkerLabel,
	MapRoute,
	type MapRef,
} from "@/components/ui/map";
import {
	getOptimizedTrip,
	getRouteByRoad,
	type OSRMProfile,
	searchPlacesNominatim,
	fetchPlacesOverpass,
	fetchProvinces,
	filterProvincesByName,
	type PsgcProvince,
} from "@/api";
import type { Place, PlaceCategory, MarkerItem, RouteMode } from "@/types";
import {
	CENTER,
	STOPS_PER_DAY,
	getDayColor,
	PROVINCE_BBOXES,
	PROVINCES_BY_REGION,
	REGIONS,
	SUPPORTED_PROVINCE_NAMES,
	TYPE_FILTERS,
	PROFILE_LABELS,
} from "@/constants";
import { distanceMeters } from "@/lib/distance";
import { orderByNearestFromStart } from "@/lib/orderStops";
import { getRouteSegmentsByDay } from "@/lib/routeSegments";
import { placeMatchesType, placeCategoryTag } from "@/lib/placeUtils";
import { Mountain, Waves, MapPin, ChevronRight, Check, Loader2, Calendar, X } from "lucide-react";

const REGION_ICONS = { mountain: Mountain, waves: Waves } as const;

/** Convert our bbox [south, west, north, east] to MapLibre [[west, south], [east, north]]. */
function bboxToBounds(bbox: [number, number, number, number]): [[number, number], [number, number]] {
	return [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
}

const App = () => {
	const mapRef = useRef<MapRef | null>(null);
	const [markers, setMarkers] = useState<MarkerItem[]>([]);
	const [routeMode, setRouteMode] = useState<RouteMode>("road");
	const [profile, setProfile] = useState<OSRMProfile>("driving");
	const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stats, setStats] = useState<{ distance?: number; duration?: number }>({});
	const [places, setPlaces] = useState<Place[] | null>(null);
	const [placesLoading, setPlacesLoading] = useState(false);
	const [placesError, setPlacesError] = useState<string | null>(null);
	const [placeSearch, setPlaceSearch] = useState("");
	const [selectedPlaces, setSelectedPlaces] = useState<Place[]>([]);
	const [region, setRegion] = useState<"luzon" | "visayas" | "mindanao">("visayas");
	const [province, setProvince] = useState("Cebu");
	const [typeFilter, setTypeFilter] = useState<PlaceCategory | null>("beaches");
	/** 5 provinces per region from PSGC; keyed by region. Fallback to PROVINCES_BY_REGION names. */
	const [provincesByRegion, setProvincesByRegion] = useState<Record<"luzon" | "visayas" | "mindanao", { name: string }[]>>({
		luzon: PROVINCES_BY_REGION.luzon.map((name) => ({ name })),
		visayas: PROVINCES_BY_REGION.visayas.map((name) => ({ name })),
		mindanao: PROVINCES_BY_REGION.mindanao.map((name) => ({ name })),
	});
	const [reviewOpen, setReviewOpen] = useState(false);
	const [searchPlaceLoading, setSearchPlaceLoading] = useState(false);
	const [searchPlaceError, setSearchPlaceError] = useState<string | null>(null);
	const [stopDays, setStopDays] = useState<number[]>([]);
	const [clickedMarkerIndex, setClickedMarkerIndex] = useState<number | null>(null);
	const prevPlacesLengthRef = useRef(0);

	// Fetch provinces from PSGC and group 5 per region (by islandGroupCode)
	useEffect(() => {
		fetchProvinces()
			.then((all) => {
				const filtered = filterProvincesByName(all, SUPPORTED_PROVINCE_NAMES);
				const byName = new Map(filtered.map((p) => [p.name.toLowerCase(), p]));
				const next: Record<"luzon" | "visayas" | "mindanao", { name: string }[]> = {
					luzon: PROVINCES_BY_REGION.luzon.map((name) => ({ name: byName.get(name.toLowerCase())?.name ?? name })),
					visayas: PROVINCES_BY_REGION.visayas.map((name) => ({ name: byName.get(name.toLowerCase())?.name ?? name })),
					mindanao: PROVINCES_BY_REGION.mindanao.map((name) => ({ name: byName.get(name.toLowerCase())?.name ?? name })),
				};
				setProvincesByRegion(next);
			})
			.catch(() => {});
	}, []);

	// When region changes: if current province is not in this region, select first province of the region
	useEffect(() => {
		const namesInRegion = provincesByRegion[region].map((p) => p.name);
		if (namesInRegion.length > 0 && !namesInRegion.includes(province)) {
			setProvince(namesInRegion[0]);
		}
	}, [region, provincesByRegion]);

	// When province changes: default type to beaches, focus map on province
	useEffect(() => {
		setTypeFilter("beaches");
		const bbox = PROVINCE_BBOXES[province];
		if (bbox) {
			const timer = setTimeout(() => {
				mapRef.current?.fitBounds(bboxToBounds(bbox), { padding: 50, duration: 500 });
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [province]);

	// Load places when province changes (best spots for selected province + default type)
	useEffect(() => {
		const bbox = PROVINCE_BBOXES[province];
		if (!bbox) return;
		setPlacesLoading(true);
		setPlacesError(null);
		fetchPlacesOverpass(bbox).then(({ places: list, error: err }) => {
			setPlacesLoading(false);
			if (err) setPlacesError(err);
			else setPlaces(list);
		});
	}, [province]);

	const applyRoadRoute = useCallback(async () => {
		const coords = markers.map((m) => m.coords);
		setLoading(true);
		setError(null);
		const result = await getRouteByRoad(coords, profile);
		setLoading(false);
		if (result.error) {
			setError(result.error);
			return;
		}
		setRouteCoords(result.routeCoords);
		setRouteMode("road");
		setStats({
			distance: result.distanceMeters,
			duration: result.durationSeconds,
		});
	}, [markers, profile]);

	const applyOptimizedRoute = useCallback(async () => {
		const coords = markers.map((m) => m.coords);
		setLoading(true);
		setError(null);
		const result = await getOptimizedTrip(coords, profile, true);
		setLoading(false);
		if (result.error) {
			setError(result.error);
			return;
		}
		setRouteCoords(result.routeCoords);
		setRouteMode("optimized");
		setStats({
			distance: result.distanceMeters,
			duration: result.durationSeconds,
		});
		if (result.orderedWaypoints.length === markers.length) {
			const sorted = result.orderedWaypoints
				.slice()
				.sort((a, b) => (a.waypoint_index ?? 0) - (b.waypoint_index ?? 0));
			const newMarkers = sorted.map((wp, i) => ({
				id: i,
				label: `Stop ${i + 1}`,
				coords: wp.location as [number, number],
			}));
			setMarkers(newMarkers);
		}
	}, [markers, profile]);

	const suggestRouteByDistance = useCallback(() => {
		if (selectedPlaces.length < 2) return;
		const ordered = orderByNearestFromStart(selectedPlaces);
		setSelectedPlaces(ordered);
		setStopDays(ordered.map((_, i) => Math.floor(i / STOPS_PER_DAY) + 1));
		setRouteMode("road");
		setError(null);
	}, [selectedPlaces]);

	useEffect(() => {
		if (markers.length < 2) {
			setRouteCoords([]);
			setStats({});
			return;
		}
		if (routeMode !== "road") return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		getRouteByRoad(
			markers.map((m) => m.coords),
			profile
		).then((result) => {
			if (cancelled) return;
			setLoading(false);
			if (result.error) {
				setError(result.error);
				return;
			}
			setRouteCoords(result.routeCoords);
			setStats({
				distance: result.distanceMeters,
				duration: result.durationSeconds,
			});
		});
		return () => {
			cancelled = true;
		};
	}, [markers, profile, routeMode]);

	useEffect(() => {
		if (selectedPlaces.length === 0) {
			prevPlacesLengthRef.current = 0;
			setMarkers([]);
			setRouteCoords([]);
			setRouteMode("road");
			setStats({});
			setStopDays([]);
			setClickedMarkerIndex(null);
			return;
		}
		const newMarkers = selectedPlaces.map((p) => ({
			id: p.id,
			label: p.name,
			coords: p.coords,
		}));
		setMarkers(newMarkers);
		const n = newMarkers.length;
		if (n !== prevPlacesLengthRef.current) {
			prevPlacesLengthRef.current = n;
			setStopDays((prev) => {
				if (n > prev.length) {
					const next = [...prev];
					for (let i = prev.length; i < n; i++) next[i] = Math.floor(i / STOPS_PER_DAY) + 1;
					return next;
				}
				if (n < prev.length) return prev.slice(0, n);
				return prev;
			});
		}
	}, [selectedPlaces]);

	const loadPlaces = useCallback(async () => {
		const bbox = PROVINCE_BBOXES[province];
		if (!bbox) {
			setPlacesError("No area defined for this province.");
			return;
		}
		setPlacesLoading(true);
		setPlacesError(null);
		const { places: list, error: err } = await fetchPlacesOverpass(bbox);
		setPlacesLoading(false);
		if (err) setPlacesError(err);
		else setPlaces(list);
	}, [province]);

	const searchForPlace = useCallback(async () => {
		const q = placeSearch.trim();
		if (!q) return;
		const bbox = PROVINCE_BBOXES[province];
		if (!bbox) {
			setSearchPlaceError("Select a province first.");
			return;
		}
		setSearchPlaceLoading(true);
		setSearchPlaceError(null);
		const { places: searchResults, error: err } = await searchPlacesNominatim(q, bbox);
		setSearchPlaceLoading(false);
		if (err) {
			setSearchPlaceError(err);
			return;
		}
		setSearchPlaceError(null);
		if (searchResults.length === 0) {
			setSearchPlaceError(`No results for "${q}" in ${province}. Try a different spelling.`);
			return;
		}
		setPlaces((prev) => {
			const byId: Record<string, Place> = {};
			for (const p of prev ?? []) byId[p.id] = p;
			for (const p of searchResults) byId[p.id] = p;
			return Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
		});
	}, [placeSearch, province]);

	const filteredPlaces = useMemo(() => {
		if (!places) return [];
		let list = places;
		const q = placeSearch.trim().toLowerCase();
		if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
		if (typeFilter) {
			list = list.filter((p) => placeMatchesType(p, typeFilter));
			// When default type (e.g. beaches) matches nothing, show all places so "best spots" still updates
			if (list.length === 0 && places.length > 0) list = places.filter((p) => !q || p.name.toLowerCase().includes(q));
		}
		return list;
	}, [places, placeSearch, typeFilter]);

	const addPlaceToRoute = useCallback((place: Place) => {
		setSelectedPlaces((prev) =>
			prev.some((p) => p.id === place.id) ? prev : [...prev, place]
		);
	}, []);

	const removePlaceFromRoute = useCallback((placeId: string) => {
		setSelectedPlaces((prev) => prev.filter((p) => p.id !== placeId));
	}, []);

	const selectedIndex = useCallback(
		(placeId: string) => {
			const i = selectedPlaces.findIndex((p) => p.id === placeId);
			return i >= 0 ? i + 1 : null;
		},
		[selectedPlaces]
	);

	const clearRoute = useCallback(() => {
		setSelectedPlaces([]);
		setMarkers([]);
		setRouteCoords([]);
		setRouteMode("road");
		setStats({});
		setStopDays([]);
		setClickedMarkerIndex(null);
	}, []);

	const setStopDay = useCallback((index: number, day: number) => {
		setStopDays((prev) => {
			const next = [...prev];
			if (index >= 0 && index < next.length) next[index] = Math.max(1, day);
			return next;
		});
	}, []);

	const autoAssignDays = useCallback(() => {
		setStopDays((prev) => prev.map((_, i) => Math.floor(i / STOPS_PER_DAY) + 1));
	}, []);

	const maxDay = useMemo(() => Math.max(1, ...stopDays, Math.ceil(markers.length / STOPS_PER_DAY)), [stopDays, markers.length]);
	const daySummary = useMemo(() => {
		const counts: Record<number, number> = {};
		stopDays.forEach((d) => { counts[d] = (counts[d] ?? 0) + 1; });
		return counts;
	}, [stopDays]);

	const routeSegmentsByDay = useMemo(
		() => getRouteSegmentsByDay(routeCoords, markers, stopDays),
		[routeCoords, markers, stopDays]
	);

	const referencePoint = selectedPlaces.length > 0 ? selectedPlaces[0].coords : CENTER;

	return (
		<div className="flex h-screen flex-col bg-neutral-100 text-neutral-900">
			{/* Top bar */}
			<header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-sm">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
							<MapPin className="h-5 w-5" />
						</div>
						<div>
							<h1 className="text-lg font-semibold text-neutral-900">UbanGo Planner</h1>
							<p className="text-xs text-neutral-500">STEP 2: REGIONAL SPOT SELECTION</p>
						</div>
					</div>
					<div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
						<span className="rounded-md bg-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600">1</span>
						<span className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white">2 Pick Spots</span>
						<span className="rounded-md bg-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600">3</span>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<button type="button" className="text-sm text-neutral-600 hover:text-neutral-900 underline-offset-2 hover:underline">
						Save Draft
					</button>
					<button
						type="button"
						onClick={() => setReviewOpen(true)}
						className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
					>
						Review Trip
					</button>
				</div>
			</header>

			<div className="flex flex-1 min-h-0">
				{/* Left sidebar */}
				<aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
					<div className="border-b border-neutral-100 p-3">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">SELECT REGION</h2>
						<div className="mt-2 flex flex-col gap-1">
							{REGIONS.map((r) => {
								const RegionIcon = REGION_ICONS[r.iconName];
								return (
									<button
										key={r.id}
										type="button"
										onClick={() => setRegion(r.id)}
										className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
											region === r.id
												? "bg-emerald-600 text-white"
												: "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
										}`}
									>
										<span className="flex items-center gap-2">
											<RegionIcon className="h-4 w-4" />
											{r.name}
										</span>
										<ChevronRight className="h-4 w-4 opacity-70" />
									</button>
								);
							})}
						</div>
					</div>
					<div className="border-b border-neutral-100 p-3">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
							PROVINCES (5 per region) — <a href="https://psgc.gitlab.io/api/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">PSGC</a>
						</h2>
						<div className="mt-2 flex flex-col gap-0.5">
							{provincesByRegion[region].map((p) => (
								<button
									key={p.name}
									type="button"
									onClick={() => setProvince(p.name)}
									className={`rounded-lg px-3 py-2 text-left text-sm ${
										province === p.name ? "bg-emerald-600 font-medium text-white" : "text-neutral-600 hover:bg-neutral-50"
									}`}
								>
									{p.name}
								</button>
							))}
						</div>
					</div>
					<div className="p-3">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">TYPE</h2>
						<div className="mt-2 flex flex-wrap gap-1.5">
							{TYPE_FILTERS.map((t) => (
								<button
									key={t.id}
									type="button"
									onClick={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
									className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
										typeFilter === t.id
											? "bg-emerald-600 text-white"
											: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
									}`}
								>
									{t.label}
								</button>
							))}
						</div>
					</div>
				</aside>

				{/* Map + overlay + place carousel */}
				<main className="relative flex flex-1 flex-col min-h-0">
					<Map
						ref={mapRef}
						className="h-full w-full"
						theme="light"
						viewport={{ center: CENTER, zoom: 12 }}
					>
						{routeSegmentsByDay.length > 0
							? routeSegmentsByDay.map((seg, idx) => (
									<MapRoute
										key={`day-${seg.day}-${idx}`}
										coordinates={seg.coords}
										color={getDayColor(seg.day).hex}
										width={4}
										opacity={0.9}
									/>
								))
							: routeCoords.length >= 2 && (
									<MapRoute coordinates={routeCoords} color="#059669" width={3} />
								)}
						{markers.map(({ id, label, coords }, i) => {
							const day = stopDays[i] ?? Math.floor(i / STOPS_PER_DAY) + 1;
							const colors = getDayColor(day);
							return (
								<MapMarker
									key={id}
									longitude={coords[0]}
									latitude={coords[1]}
									onClick={() => setClickedMarkerIndex(i)}
								>
									<MarkerContent>
										<div
											className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-lg transition hover:scale-110 ${colors.bg}`}
											title={`Stop ${i + 1} · Day ${day} · ${label}`}
										>
											D{day}
										</div>
									</MarkerContent>
									<MarkerLabel position="top">
										<span className="rounded px-1.5 py-0.5 text-xs font-medium text-white shadow" style={{ backgroundColor: colors.hex }}>
											{i + 1}. {label}
										</span>
									</MarkerLabel>
								</MapMarker>
							);
						})}
						<MapControls position="bottom-right" showZoom showLocate />
					</Map>

					{/* Marker popup: assign day when a marker is clicked */}
					{clickedMarkerIndex !== null && selectedPlaces[clickedMarkerIndex] && (
						<div className={`absolute left-4 z-20 w-72 rounded-xl border-2 border-neutral-200 bg-white shadow-xl ${markers.length >= 2 ? "top-[5rem]" : "top-4"}`}>
							<div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
								<span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
									<Calendar className="h-4 w-4" /> Assign to day
								</span>
								<button
									type="button"
									onClick={() => setClickedMarkerIndex(null)}
									className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
									aria-label="Close"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
							<div className="p-3">
								<p className="font-medium text-neutral-900">
									Stop {clickedMarkerIndex + 1}: {selectedPlaces[clickedMarkerIndex].name}
								</p>
								{selectedPlaces[clickedMarkerIndex].address && (
									<p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
										{selectedPlaces[clickedMarkerIndex].address}
									</p>
								)}
								<p className="mt-2 text-xs font-medium text-neutral-500">Day</p>
								<div className="mt-1 flex flex-wrap gap-1.5">
									{Array.from({ length: maxDay }, (_, d) => d + 1).map((d) => {
										const c = getDayColor(d);
										const isActive = (stopDays[clickedMarkerIndex] ?? 1) === d;
										return (
											<button
												key={d}
												type="button"
												onClick={() => {
													setStopDay(clickedMarkerIndex, d);
													setClickedMarkerIndex(null);
												}}
												className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white transition ${c.bg} ${isActive ? "ring-2 ring-offset-1 ring-neutral-400" : "opacity-90 hover:opacity-100"}`}
											>
												Day {d}
											</button>
										);
									})}
								</div>
							</div>
						</div>
					)}

					{/* Route controls on map — visible when 2+ stops */}
					{markers.length >= 2 && (
						<div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
							<span className="text-xs font-medium text-neutral-500">Route</span>
							<button
								type="button"
								onClick={applyRoadRoute}
								disabled={loading}
								className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${routeMode === "road" ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"} disabled:opacity-50`}
							>
								{loading ? "…" : "By road"}
							</button>
							<button
								type="button"
								onClick={applyOptimizedRoute}
								disabled={loading}
								title="Shortest total driving time"
								className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${routeMode === "optimized" ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"} disabled:opacity-50`}
							>
								{loading ? "…" : "Shortest route"}
							</button>
							<button
								type="button"
								onClick={suggestRouteByDistance}
								disabled={loading}
								title="Reorder by distance from Stop 1"
								className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
							>
								Suggest route
							</button>
							{(stats.distance != null || stats.duration != null) && (
								<span className="text-xs text-neutral-500">
									{stats.distance != null && `${(stats.distance / 1000).toFixed(1)} km`}
									{stats.distance != null && stats.duration != null && " · "}
									{stats.duration != null && `${Math.round(stats.duration / 60)} min`}
								</span>
							)}
							<button
								type="button"
								onClick={() => setReviewOpen(true)}
								className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
							>
								More options
							</button>
						</div>
					)}

					{/* Regional discovery card — below route strip / marker popup when open */}
					<div
						className={`absolute left-4 z-10 rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm ${
							clickedMarkerIndex !== null ? "top-[11rem]" : markers.length >= 2 ? "top-[4.5rem]" : "top-4"
						}`}
					>
						<div className="flex items-center gap-2">
							<div className="h-2 w-2 rounded-full bg-emerald-500" />
							<span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
								Regional Discovery
							</span>
						</div>
						<p className="mt-1 font-medium text-neutral-900">
							{province}, {region === "visayas" ? "Visayas" : region === "luzon" ? "Luzon" : "Mindanao"}
						</p>
						<p className="text-sm text-neutral-600">
							{places
								? `${filteredPlaces.length} places (all types) in ${province}`
								: `Fetch places for ${province}`}
						</p>
						{selectedPlaces.length > 0 && (
							<div className="mt-1 flex flex-wrap gap-1">
								{Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
									<span
										key={d}
										className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
										style={{ backgroundColor: getDayColor(d).hex }}
									>
										Day {d}: {daySummary[d] ?? 0}
									</span>
								))}
							</div>
						)}
						{placesError && <p className="mt-0.5 text-xs text-red-600">{placesError}</p>}
						{stats.duration != null && (
							<p className="mt-1 text-sm text-neutral-600">AVG. TRAVEL: {Math.round(stats.duration / 60)} min</p>
						)}
						<p className="mt-0.5 text-sm text-amber-600">POPULARITY: ★★★★★</p>
					</div>

					{/* Place cards carousel */}
					<div className="absolute bottom-4 left-0 right-0 z-10 overflow-x-auto px-4">
						<div className="flex gap-3 pb-2">
							{!places && (
								<button
									type="button"
									onClick={loadPlaces}
									disabled={placesLoading || !PROVINCE_BBOXES[province]}
									className="shrink-0 rounded-xl border-2 border-dashed border-neutral-300 bg-white px-6 py-8 text-sm font-medium text-neutral-500 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
								>
									{placesLoading ? (
										<span className="flex items-center gap-2">
											<Loader2 className="h-4 w-4 animate-spin" /> Loading…
										</span>
									) : PROVINCE_BBOXES[province] ? (
										`Fetch all types for ${province}`
									) : (
										"Select a province (Visayas)"
									)}
								</button>
							)}
							{places && filteredPlaces.length === 0 && (
								<div className="shrink-0 rounded-xl border border-neutral-200 bg-white px-6 py-4 text-sm text-neutral-500">
									No places match. Try another type or search.
								</div>
							)}
							{filteredPlaces.slice(0, 20).map((place) => {
								const stopNum = selectedIndex(place.id);
								const distKm = (distanceMeters(referencePoint, place.coords) / 1000).toFixed(1);
								return (
									<div
										key={place.id}
										className={`flex w-52 shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-white shadow-md transition ${
											stopNum != null ? "border-emerald-500 ring-2 ring-emerald-200" : "border-neutral-200"
										}`}
									>
										<div className="relative h-28 w-full shrink-0 bg-neutral-100">
											{place.imageUrl ? (
												<img src={place.imageUrl} alt="" className="h-full w-full object-cover" />
											) : (
												<div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
													No image
												</div>
											)}
											{stopNum != null && (
												<div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
													<Check className="h-3.5 w-3.5" />
												</div>
											)}
											<span className="absolute left-2 top-2 rounded bg-neutral-700/80 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
												{placeCategoryTag(place)}
											</span>
										</div>
										<div className="flex flex-1 flex-col p-3">
											<a
												href={place.wikipediaUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="line-clamp-2 text-sm font-medium text-neutral-900 hover:underline"
											>
												{place.name}
											</a>
											{place.address && (
												<p className="mt-0.5 line-clamp-2 text-xs text-neutral-500" title={place.address}>
													{place.address}
												</p>
											)}
											<p className="mt-0.5 text-xs text-neutral-500">{distKm} km</p>
											{stopNum != null ? (
												<>
													<span
														className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
														style={{ backgroundColor: getDayColor(stopDays[stopNum - 1] ?? 1).hex }}
													>
														Day {stopDays[stopNum - 1] ?? 1}
													</span>
													<button
														type="button"
														onClick={() => removePlaceFromRoute(place.id)}
														className="mt-2 rounded-lg bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300"
													>
														Remove
													</button>
												</>
											) : (
												<button
													type="button"
													onClick={() => addPlaceToRoute(place)}
													className="mt-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
												>
													+ Add to Trip
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* Search above carousel: filter + Search place (OpenStreetMap) */}
					<div className="absolute bottom-[calc(12rem+1rem)] left-4 right-4 z-10 max-w-md space-y-1">
						<div className="flex gap-2">
							<input
								type="search"
								placeholder='Search place, street, suburb (e.g. "Estaca", "Parkmall")…'
								value={placeSearch}
								onChange={(e) => {
									setPlaceSearch(e.target.value);
									setSearchPlaceError(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") searchForPlace();
								}}
								className="flex-1 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
							/>
							<button
								type="button"
								onClick={searchForPlace}
								disabled={searchPlaceLoading || !placeSearch.trim()}
								title="Search OpenStreetMap (streets, suburbs, places)"
								className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
							>
								{searchPlaceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
							</button>
						</div>
						{searchPlaceError && (
							<p className="text-xs text-red-600">{searchPlaceError}</p>
						)}
						<p className="text-xs text-neutral-500">
							Search OpenStreetMap in {province}. Fetch loads all types (streets, suburbs, POIs) for selected province.
						</p>
					</div>
				</main>
			</div>

			{/* Bottom bar */}
			<footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-4 py-3 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600">
						PH
					</div>
					<div className="flex items-center gap-2">
						<MapPin className="h-4 w-4 text-neutral-500" />
						<span className="text-sm font-medium text-neutral-900">
							{selectedPlaces.length} stop{selectedPlaces.length !== 1 ? "s" : ""}
						</span>
					</div>
					{selectedPlaces.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							{Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
								<span
									key={d}
									className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
									style={{ backgroundColor: getDayColor(d).hex }}
								>
									Day {d}: {daySummary[d] ?? 0}
								</span>
							))}
						</div>
					)}
					<span className="text-xs text-neutral-500">
						EXPLORING {province.toUpperCase()} {region === "visayas" ? "VISAYAS" : region.toUpperCase()}
					</span>
				</div>
				<button
					type="button"
					onClick={() => setReviewOpen(true)}
					className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
				>
					Review Itinerary
					<ChevronRight className="h-4 w-4" />
				</button>
			</footer>

			{/* Review Itinerary panel (modal/sheet) */}
			{reviewOpen && (
				<>
					<div
						className="fixed inset-0 z-40 bg-black/40"
						aria-hidden
						onClick={() => setReviewOpen(false)}
					/>
					<div className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-neutral-200 bg-white shadow-xl">
						<div className="flex h-full flex-col">
							<div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
								<h2 className="text-lg font-semibold text-neutral-900">Review Itinerary</h2>
								<button
									type="button"
									onClick={() => setReviewOpen(false)}
									className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
								>
									×
								</button>
							</div>
							<div className="flex-1 overflow-y-auto p-4">
								{/* Itinerary by day */}
								{markers.length > 0 && (
									<>
										<div className="flex items-center justify-between">
											<h3 className="text-sm font-semibold text-neutral-700">Itinerary by day</h3>
											<button
												type="button"
												onClick={autoAssignDays}
												className="text-xs text-emerald-600 hover:underline"
											>
												Auto-assign (4/day)
											</button>
										</div>
										<div className="mt-2 space-y-3">
											{Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => {
												const indices = stopDays
													.map((day, idx) => (day === d ? idx : -1))
													.filter((i) => i >= 0);
												if (indices.length === 0) return null;
												const c = getDayColor(d);
												return (
													<div key={d} className={`rounded-lg border-2 p-2 ${c.light} ${c.border}`}>
														<p className={`text-xs font-bold ${c.text}`}>Day {d}</p>
														<ul className="mt-1 space-y-1">
															{indices.map((idx) => (
																<li key={idx} className="flex items-center justify-between gap-2 text-sm">
																	<span className="truncate text-neutral-800">
																		{idx + 1}. {markers[idx]?.label ?? selectedPlaces[idx]?.name}
																	</span>
																	<select
																		value={stopDays[idx] ?? 1}
																		onChange={(e) => setStopDay(idx, Number(e.target.value))}
																		className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700"
																	>
																		{Array.from({ length: maxDay }, (_, i) => i + 1).map((dayNum) => (
																			<option key={dayNum} value={dayNum}>
																				Day {dayNum}
																			</option>
																		))}
																	</select>
																</li>
															))}
														</ul>
													</div>
												);
											})}
										</div>
										<div className="mt-3 text-sm text-neutral-500">
											Click a map marker to assign a stop to a day.
										</div>
									</>
								)}
								<div className="mt-3 text-sm text-neutral-600">
									Route: {markers.length > 0 ? `Stop 1 → ${markers.length > 1 ? `… → Stop ${markers.length}` : "1"}` : "—"}
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={applyRoadRoute}
										disabled={loading || markers.length < 2}
										className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
											routeMode === "road"
												? "bg-emerald-600 text-white"
												: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
										} disabled:opacity-50`}
									>
										{loading ? "…" : "By road"}
									</button>
									<button
										type="button"
										onClick={applyOptimizedRoute}
										disabled={loading || markers.length < 2}
										title="Reorder stops for the shortest total driving time"
										className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
											routeMode === "optimized"
												? "bg-emerald-600 text-white"
												: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
										} disabled:opacity-50`}
									>
										{loading ? "…" : "Shortest route order"}
									</button>
									<button
										type="button"
										onClick={() => {
											suggestRouteByDistance();
											setReviewOpen(false);
										}}
										disabled={markers.length < 2}
										title="Reorder by distance from Stop 1"
										className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
									>
										Suggest route
									</button>
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									{(["driving", "walking", "cycling"] as const).map((p) => (
										<button
											key={p}
											type="button"
											onClick={() => setProfile(p)}
											className={`rounded-lg px-3 py-2 text-sm ${
												profile === p ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
											}`}
										>
											{PROFILE_LABELS[p]}
										</button>
									))}
								</div>
								{error && <p className="mt-2 text-sm text-red-600">{error}</p>}
								{(stats.distance != null || stats.duration != null) && (
									<p className="mt-2 text-sm text-neutral-600">
										{stats.distance != null && <span>{(stats.distance / 1000).toFixed(1)} km</span>}
										{stats.distance != null && stats.duration != null && " · "}
										{stats.duration != null && <span>{Math.round(stats.duration / 60)} min</span>}
									</p>
								)}
								<button
									type="button"
									onClick={clearRoute}
									className="mt-4 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
								>
									Clear route
								</button>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
};

export default App;
