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

**Province & default type:** The app shows **5 provinces** from the [PSGC API](https://psgc.gitlab.io/api/) (Cebu, Bohol, Negros Oriental, Siquijor, Iloilo). When you select a province, the **type filter defaults to "Beaches"**, places are **auto-loaded** for that province (Overpass), and the **map camera fits** to the province bbox.

---

## 2. Algorithms and logic

### 2.1 Distance: Haversine formula

**Purpose:** Compute straight-line distance between two map points (e.g. stop vs route vertex, or “nearest next” stop) so we can order stops, project markers onto the route, and show “X km” from a reference point. Uses great-circle distance because coordinates are on a sphere.

**Where:** `src/lib/distance.ts` → `distanceMeters(a, b)`

**Algorithm:** Haversine formula for great-circle distance on a sphere.

- **Input:** Two points as `[longitude, latitude]` in degrees.
- **Constants:** Earth radius `R = 6_371_000` m.
- **Steps:** Convert lat/lng deltas to radians; compute central angle via  
  `sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2)`; return `2·R·atan2(√x, √(1−x))`.
- **Output:** Distance in meters (as-the-crow-flies). No road or elevation.

---

### 2.2 Stop ordering: Greedy nearest-neighbor (TSP heuristic)

**Purpose:** Suggest a visit order that reduces total travel: start at the first stop, then repeatedly go to the nearest unvisited stop. Powers the “Suggest route” action so the user gets a quick, reasonable order without calling the OSRM Trip API. Optional; the user can still choose “Shortest route” (OSRM) for a better global order.

**Where:** `src/lib/orderStops.ts` → `orderByNearestFromStart(items)`

**Algorithm:** Nearest-neighbor heuristic for the Traveling Salesman Problem (TSP).

- **Logic:**
  1. Fix the **first** item as the start (order is not fully optimized from all possible starts).
  2. From the current point, find the **nearest** remaining item (by `distanceMeters`).
  3. Append it to the ordered list, remove from remaining, set as new “current”.
  4. Repeat until no items left.
- **Complexity:** O(n²) distance computations for n stops.
- **Note:** Does not guarantee the globally shortest tour; OSRM Trip (see below) can do a better server-side optimization when you use “Optimized” route.

---

### 2.3 Route–marker projection: Closest point on polyline

**Purpose:** Find where each itinerary stop (marker) lies along the road route so we can split the route into segments between consecutive stops. That split is used to color the line by day (e.g. Day 1 blue, Day 2 green) and show “this stretch belongs to Day N.”

**Where:** `src/lib/routeSegments.ts` → `findClosestRouteIndex(routeCoords, point)`

**Algorithm:** Linear scan along the route polyline.

- **Logic:** For each route vertex, compute `distanceMeters(vertex, point)`; return the index of the vertex with minimum distance.
- **Complexity:** O(L) where L = number of route points. No spatial index; sufficient for typical route lengths.

---

### 2.4 Day segments: Split route by stop order and days

**Purpose:** Turn the full route polyline into per-day segments so the map can draw each day in a different color (e.g. Day 1–5) and the user can see which part of the trip is Day 1, Day 2, etc. Uses stop order and per-stop day assignment (manual or auto by STOPS_PER_DAY).

**Where:** `src/lib/routeSegments.ts` → `getRouteSegmentsByDay(routeCoords, markers, stopDays)`

**Logic (step by step):**

1. **Project markers onto route**  
   For each marker, get `findClosestRouteIndex(routeCoords, marker.coords)` → one index per marker.

2. **Enforce strictly increasing indices**  
   So segments are non-overlapping and follow travel order:  
   If `indices[i] <= indices[i-1]`, set `indices[i] = min(indices[i-1] + 1, routeCoords.length - 1)`.  
   Clamp the last index to `routeCoords.length - 1` so it stays on the route.

3. **Build one segment per pair of consecutive markers**  
   For each `i` from `0` to `markers.length - 2`:  
   - Segment = `routeCoords.slice(indices[i], indices[i+1] + 1)`.  
   - Only keep segments with at least 2 points.  
   - **Day** for that segment: `stopDays[i]` if set, else `floor(i / STOPS_PER_DAY) + 1` (1-based day).

4. **Output**  
   Array of `{ coords, day }` (i.e. `RouteSegment[]`) used to draw the route in different colors per day.

---

### 2.5 Place type filter: Category + keyword fallback

**Purpose:** Filter the place list by type (Beaches, Mountains, Heritage) so the user sees only the kind of spots they care about. Uses explicit `place.category` when set (e.g. from Overpass tags) and falls back to name keywords so places without a category still match when the name suggests the type.

**Where:** `src/lib/placeUtils.ts` → `placeMatchesType(place, type)`

**Logic:**

- **`type === null`:** Match all (no filter).
- **Exact:** If `place.category === type`, match.
- **Keyword fallback (when category missing or different):**  
  Lowercase `place.name`; then:
  - **beaches:** name contains any of `"beach"`, `"resort"`, `"island"`.
  - **mountains:** name contains any of `"mountain"`, `"peak"`, `"hill"`, `"view"`.
  - **heritage:** name contains any of `"church"`, `"temple"`, `"museum"`, `"heritage"`, `"monument"`.
- **Else:** No match.

Substring checks are case-insensitive.

---

### 2.6 Place category tag (display label)

**Purpose:** Show a short label on each place card (e.g. “NATURE”, “HERITAGE”, or a formatted OSM type) so the user can quickly see what kind of place it is without opening the link. Used for the badge on the place carousel cards.

**Where:** `src/lib/placeUtils.ts` → `placeCategoryTag(place)`

**Logic (cascade):**

1. If `place.category === "beaches"` or `"mountains"` → `"NATURE"`.
2. Else if `place.category === "heritage"` → `"HERITAGE"`.
3. Else if `place.placeType` exists → capitalize and replace underscores with spaces (e.g. `"tourist_attraction"` → `"Tourist attraction"`).
4. Else → `"LANDMARK"`.

---

### 2.7 Routing APIs (OSRM): Trip vs Route

**Purpose:** Get a road-following path between stops (driving/walking/cycling) and optionally let the server reorder stops to shorten the trip. Trip = “best order + path”; Route = “path in the order I gave.” Powers the “By road” and “Shortest route” buttons and provides the polyline and distance/duration shown on the map and in the UI.

**Where:** `src/api/osrm.ts`

| API | Algorithm / behavior | Use in app |
|-----|----------------------|------------|
| **Trip** (`getOptimizedTrip`) | OSRM solves a **TSP** on the server: finds an order of waypoints that minimizes total travel (distance/duration) and returns that order plus road geometry. Optional roundtrip (return to start). | “Optimized” route: order of stops is changed to a shorter tour; markers are reordered to match. |
| **Route** (`getRouteByRoad`) | **Fixed order**: waypoints are visited in the order given. OSRM returns the road path (polyline) and total distance/duration. | “Road” route: user/suggested order is kept; we only get the driving/walking/cycling path. |

**Profile:** `driving` | `walking` | `cycling` selects the cost function (road network and speeds) used by OSRM.

---

## 3. Folder structure

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

## 4. Types (DTOs and enums)

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

## 5. Constants

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

## 6. Lib (pure helpers)

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

## 7. API (external services)

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

## 8. App.tsx — main state and handlers

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

## 9. Path aliases

- `@/` → `src/` (e.g. `@/types`, `@/constants`, `@/lib/...`, `@/api`).
- Configured in `vite.config.ts` and `tsconfig.app.json`.

---

*Last updated to match the current folder structure and exports.*
