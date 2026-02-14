# UbanGo Planner — Flow, Structure & Functions

Guide to app flow, folder structure, and what each module/function does.

---

## 1. App flow (high level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER                                                                        │
│  • Picks region (Luzon / Visayas / Mindanao) → province (e.g. Cebu)          │
│  • Loads places (Overpass) or searches (Nominatim) → list of Place[]        │
│  • Filters by type (Beaches / Mountains / Heritage) → filteredPlaces        │
│  • Adds/removes places to “route” → selectedPlaces → markers                │
│  • Optional: “Suggest by distance” → orderByNearestFromStart → reorder       │
│  • Route mode: Road (order fixed) or Optimized (OSRM trip) → routeCoords      │
│  • Stop days assigned (manual or auto by STOPS_PER_DAY) → stopDays           │
│  • Route split into segments per day → routeSegmentsByDay (colored on map)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data flow summary

| Step | Source | Result |
|------|--------|--------|
| 1 | Region + Province | `PROVINCE_BBOXES[province]` → bbox for Overpass/Nominatim |
| 2 | “Load places” | `fetchPlacesOverpass(bbox)` → `places` |
| 3 | Search box | `searchPlacesNominatim(query, bbox)` → merge into `places` |
| 4 | Type filter + search text | `placeMatchesType` + name filter → `filteredPlaces` |
| 5 | Add to route | `selectedPlaces` → derived `markers` + `stopDays` |
| 6 | Route request | `getRouteByRoad` or `getOptimizedTrip` → `routeCoords` + stats |
| 7 | Day segments | `getRouteSegmentsByDay(routeCoords, markers, stopDays)` → colored segments |

---

## 2. Folder structure

```
src/
├── api/                    # External APIs (OSRM, Nominatim, Overpass)
│   ├── index.ts            # Re-exports
│   ├── osrm.ts             # Routing: trip + route
│   ├── places-nominatim.ts # Search by query
│   └── places-overpass.ts  # Fetch POIs by bbox
├── components/
│   └── ui/
│       └── map.tsx         # Map, markers, route, controls
├── constants/              # Config and static data
│   ├── index.ts
│   ├── map.ts              # CENTER
│   ├── itinerary.ts       # Days, colors, regions, provinces, type filters
│   └── routing.ts         # PROFILE_LABELS (Car/Walk/Bike)
├── lib/                    # Pure helpers (no I/O)
│   ├── distance.ts         # Haversine distance
│   ├── orderStops.ts       # Greedy nearest-next ordering
│   ├── placeUtils.ts       # placeMatchesType, placeCategoryTag
│   ├── places.ts           # Re-exports Place types from @/types
│   ├── routeSegments.ts    # Split route by day for coloring
│   └── utils.ts            # cn() (Tailwind)
├── types/                  # DTOs and shared types
│   ├── index.ts
│   ├── place.ts            # Place, PlaceCategory
│   └── route.ts            # MarkerItem, RouteMode, Bbox, RouteSegment
├── App.tsx                 # UI + state + orchestration
├── main.tsx
└── index.css
```

---

## 3. Types (DTOs and enums)

### `src/types/place.ts`

| Type | Description |
|------|-------------|
| `PlaceCategory` | `"beaches" \| "mountains" \| "heritage"` — used for filters and tags. |
| `Place` | `id`, `name`, `coords` [lng, lat], `imageUrl`, `wikipediaUrl`, optional `address`, `category`, `placeType`. |

### `src/types/route.ts`

| Type | Description |
|------|-------------|
| `MarkerItem` | One stop on the map: `id`, `label`, `coords` [lng, lat]. |
| `RouteMode` | `"road"` (order fixed) or `"optimized"` (OSRM trip order). |
| `Bbox` | `[south_lat, west_lon, north_lat, east_lon]` for Overpass/Nominatim. |
| `RouteSegment` | `{ coords: [number, number][], day: number }` — segment of polyline for one day (for colored lines). |

---

## 4. Constants

### `src/constants/map.ts`

| Export | Description |
|--------|-------------|
| `CENTER` | Default map center `[lng, lat]` (e.g. Cebu City). |

### `src/constants/itinerary.ts`

| Export | Description |
|--------|-------------|
| `STOPS_PER_DAY` | Stops per day for auto-assign (e.g. 4). |
| `DAY_COLORS` | Array of theme objects: `bg`, `border`, `light`, `text`, `hex` per day. |
| `getDayColor(day)` | Returns the color object for a given day number. |
| `PROVINCE_BBOXES` | Map province name → `Bbox` (e.g. Cebu, Bohol, Negros Oriental, Siquijor). |
| `PROVINCES_VISAYAS` | List of province names for Visayas. |
| `TYPE_FILTERS` | `{ id: PlaceCategory, label: string }[]` (Beaches, Mountains, Heritage). |
| `REGIONS` | `{ id, name, iconName }[]` (Luzon, Visayas, Mindanao). Icons resolved in App via `REGION_ICONS`. |

### `src/constants/routing.ts`

| Export | Description |
|--------|-------------|
| `PROFILE_LABELS` | `Record<OSRMProfile, string>`: "Car", "Walk", "Bike". |

---

## 5. Lib (pure helpers)

### `src/lib/distance.ts`

| Function | Description |
|----------|-------------|
| `distanceMeters(a, b)` | Haversine distance in meters between two `[lng, lat]` points. |

### `src/lib/orderStops.ts`

| Function | Description |
|----------|-------------|
| `orderByNearestFromStart(items)` | Greedy TSP: keeps first item, then repeatedly picks the nearest remaining item. Input/output: array of `{ coords: [lng, lat] }`. |

### `src/lib/routeSegments.ts`

| Function | Description |
|----------|-------------|
| `findClosestRouteIndex(routeCoords, point)` | Index of the route point closest to `point` (by `distanceMeters`). |
| `getRouteSegmentsByDay(routeCoords, markers, stopDays)` | Splits `routeCoords` into segments between consecutive markers; each segment gets a `day` from `stopDays` (or auto from `STOPS_PER_DAY`). Returns `RouteSegment[]` for colored polylines. |

### `src/lib/placeUtils.ts`

| Function | Description |
|----------|-------------|
| `placeMatchesType(place, type)` | Returns whether `place` matches filter `type` (null = all). Uses `place.category` or name keywords (e.g. beach, mountain, church). |
| `placeCategoryTag(place)` | Display tag: "NATURE" (beaches/mountains), "HERITAGE", or formatted `placeType`; fallback "LANDMARK". |

### `src/lib/utils.ts`

| Function | Description |
|----------|-------------|
| `cn(...inputs)` | Merges Tailwind classes (clsx + tailwind-merge). |

### `src/lib/places.ts`

Re-exports `Place` and `PlaceCategory` from `@/types` for backward compatibility.

---

## 6. API (external services)

### `src/api/osrm.ts`

| Export | Description |
|--------|-------------|
| `OSRMProfile` | Type: `"driving" \| "walking" \| "cycling"`. |
| `getOptimizedTrip(coords, profile, roundtrip?)` | OSRM Trip (TSP): returns optimized order + road geometry, `distanceMeters`, `durationSeconds`, `error`. |
| `getRouteByRoad(coords, profile)` | OSRM Route: path through points in given order; returns `routeCoords`, `distanceMeters`, `durationSeconds`, `error`. |

### `src/api/places-nominatim.ts`

| Function | Description |
|----------|-------------|
| `searchPlacesNominatim(query, bbox)` | Nominatim search in bbox; returns `{ places: Place[], error?: string }`. |

### `src/api/places-overpass.ts`

| Function | Description |
|----------|-------------|
| `fetchPlacesOverpass(bbox)` | Overpass query for amenities/shops/tourism/places/streets in bbox; returns `{ places: Place[], error?: string }`. |

---

## 7. App.tsx — main state and handlers

| State | Purpose |
|-------|---------|
| `markers` | Stops on the map (from `selectedPlaces`). |
| `routeMode` | `"road"` or `"optimized"`. |
| `profile` | OSRM profile: driving / walking / cycling. |
| `routeCoords` | Full route polyline from OSRM. |
| `places` | All loaded places (Overpass + Nominatim merged). |
| `selectedPlaces` | Places added to the itinerary (order = stop order). |
| `region` / `province` | Current region and province (drive bbox and province list). |
| `typeFilter` | PlaceCategory or null. |
| `stopDays` | Day number per stop index (1-based). |
| `routeSegmentsByDay` | Memo: `getRouteSegmentsByDay(routeCoords, markers, stopDays)` for colored segments. |

| Handler / effect | Purpose |
|-------------------|---------|
| `applyRoadRoute` | Calls `getRouteByRoad(markers, profile)` and sets `routeCoords` + stats. |
| `applyOptimizedRoute` | Calls `getOptimizedTrip(markers, profile)` and updates `routeCoords` + reorders `markers` from OSRM order. |
| `suggestRouteByDistance` | Runs `orderByNearestFromStart(selectedPlaces)` and assigns days by `STOPS_PER_DAY`. |
| Effect (markers + road) | When `routeMode === "road"` and markers change, fetches road route and updates `routeCoords`. |
| Effect (selectedPlaces → markers) | Syncs `selectedPlaces` → `markers` and extends `stopDays` for new stops. |
| `loadPlaces` | `fetchPlacesOverpass(PROVINCE_BBOXES[province])` → `places`. |
| `searchForPlace` | `searchPlacesNominatim(placeSearch, bbox)` and merges results into `places`. |
| `filteredPlaces` | Memo: filter `places` by search text and `placeMatchesType(·, typeFilter)`. |
| `addPlaceToRoute` / `removePlaceFromRoute` | Add/remove place in `selectedPlaces`. |
| `getRouteSegmentsByDay` | Used in memo to compute segments for map coloring. |

---

## 8. Path aliases

- `@/` → `src/` (e.g. `@/types`, `@/constants`, `@/lib/...`, `@/api`).
- Configured in `vite.config.ts` and `tsconfig.app.json`.

---

*Last updated to match the current folder structure and exports.*
