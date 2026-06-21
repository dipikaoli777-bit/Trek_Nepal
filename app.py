from math import asin, cos, radians, sin, sqrt
import os
from pathlib import Path
import json

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "treks.json"
FACILITIES_FILE = BASE_DIR / "data" / "facilities.json"

app = Flask(__name__)


def load_treks():
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_facilities():
    with FACILITIES_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def haversine_km(point_a, point_b):
    lon1, lat1 = point_a
    lon2, lat2 = point_b
    earth_radius_km = 6371.0

    dlon = radians(lon2 - lon1)
    dlat = radians(lat2 - lat1)
    lat1 = radians(lat1)
    lat2 = radians(lat2)

    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(a))


def route_distance_km(coordinates):
    total = 0
    for index in range(len(coordinates) - 1):
        total += haversine_km(coordinates[index], coordinates[index + 1])
    return round(total, 1)


def estimated_temperature_range(max_elevation_m):
    valley_temp_c = 24
    lapse_rate_c_per_1000m = 6.5
    high_temp = round(valley_temp_c - (max_elevation_m / 1000) * lapse_rate_c_per_1000m)
    low_temp = high_temp - 8
    return {"min_c": low_temp, "max_c": high_temp}


def trek_suggestions(temperature):
    min_temp = temperature["min_c"]
    if min_temp <= -8:
        return {
            "clothes": [
                "Down jacket, thermal base layers and fleece mid-layer",
                "Waterproof/windproof outer shell and trekking pants",
                "Warm gloves, wool cap, neck gaiter and thick socks"
            ],
            "medicines": [
                "Personal medicines and altitude sickness medicine after doctor advice",
                "ORS, paracetamol, blister pads and bandage roll",
                "Water purification tablets and sunscreen SPF 50"
            ],
            "other": [
                "Sleeping bag rated around -15 C",
                "Headlamp, power bank, trekking poles and sunglasses",
                "Emergency contact list, cash and permit copies"
            ]
        }
    if min_temp <= 2:
        return {
            "clothes": [
                "Warm jacket, fleece, thermal top and quick-dry shirts",
                "Rain jacket, trekking pants and warm socks",
                "Gloves, beanie and sun hat"
            ],
            "medicines": [
                "Basic first-aid kit, ORS and pain relief tablets",
                "Blister care, antiseptic cream and personal prescriptions",
                "Water purification tablets and lip balm"
            ],
            "other": [
                "Sleeping bag rated around -5 C",
                "Reusable water bottle, headlamp and power bank",
                "Trail snacks, map/offline GPS and permit copies"
            ]
        }
    return {
        "clothes": [
            "Light fleece, breathable shirts and quick-dry trekking pants",
            "Rain jacket or poncho for sudden weather change",
            "Sun hat, light gloves and comfortable trekking socks"
        ],
        "medicines": [
            "ORS, paracetamol, band-aids and blister pads",
            "Mosquito repellent for lower altitude sections",
            "Sunscreen, personal medicines and water purification tablets"
        ],
        "other": [
            "Water bottle, snacks, sunglasses and small towel",
            "Power bank, phone with offline map and headlamp",
            "Student ID, permit copies and cash"
        ]
    }


def point_to_segment_distance_km(point, segment_start, segment_end):
    lon, lat = point
    lon1, lat1 = segment_start
    lon2, lat2 = segment_end
    avg_lat = radians((lat + lat1 + lat2) / 3)
    km_per_degree_lat = 111.32
    km_per_degree_lon = 111.32 * cos(avg_lat)

    px = lon * km_per_degree_lon
    py = lat * km_per_degree_lat
    ax = lon1 * km_per_degree_lon
    ay = lat1 * km_per_degree_lat
    bx = lon2 * km_per_degree_lon
    by = lat2 * km_per_degree_lat

    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return sqrt((px - ax) ** 2 + (py - ay) ** 2)

    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    nearest_x = ax + t * dx
    nearest_y = ay + t * dy
    return sqrt((px - nearest_x) ** 2 + (py - nearest_y) ** 2)


def distance_to_route_km(point, coordinates):
    distances = []
    for index in range(len(coordinates) - 1):
        distances.append(point_to_segment_distance_km(point, coordinates[index], coordinates[index + 1]))
    return min(distances)


def enrich_trek(trek):
    enriched = trek.copy()
    enriched["distance_km"] = route_distance_km(trek["coordinates"])
    enriched["estimated_temperature_c"] = estimated_temperature_range(trek["max_elevation_m"])
    enriched["suggestions"] = trek_suggestions(enriched["estimated_temperature_c"])
    return enriched


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/treks")
def treks():
    difficulty = request.args.get("difficulty", "all").lower()
    season = request.args.get("season", "all").lower()
    max_days = request.args.get("max_days", type=int)

    results = []
    for trek in load_treks():
        if difficulty != "all" and trek["difficulty"].lower() != difficulty:
            continue
        if season != "all" and season not in [item.lower() for item in trek["best_seasons"]]:
            continue
        if max_days and trek["duration_days"] > max_days:
            continue
        results.append(enrich_trek(trek))

    return jsonify(results)


@app.route("/api/treks/<trek_id>")
def trek_detail(trek_id):
    for trek in load_treks():
        if trek["id"] == trek_id:
            return jsonify(enrich_trek(trek))
    return jsonify({"error": "Trek route not found"}), 404


@app.route("/api/facilities")
def facilities():
    return jsonify(load_facilities())


@app.route("/api/treks/<trek_id>/buffer")
def buffer_analysis(trek_id):
    radius_km = request.args.get("radius_km", 3, type=float)
    selected_trek = None
    for trek in load_treks():
        if trek["id"] == trek_id:
            selected_trek = trek
            break

    if not selected_trek:
        return jsonify({"error": "Trek route not found"}), 404

    nearby_facilities = []
    for facility in load_facilities():
        distance_km = distance_to_route_km(facility["coordinates"], selected_trek["coordinates"])
        if distance_km <= radius_km:
            enriched = facility.copy()
            enriched["distance_from_route_km"] = round(distance_km, 2)
            nearby_facilities.append(enriched)

    nearby_facilities.sort(key=lambda item: item["distance_from_route_km"])
    return jsonify(
        {
            "trek_id": trek_id,
            "radius_km": radius_km,
            "facility_count": len(nearby_facilities),
            "facilities": nearby_facilities,
        }
    )


@app.route("/api/stats")
def stats():
    treks_data = [enrich_trek(trek) for trek in load_treks()]
    facilities_data = load_facilities()
    return jsonify(
        {
            "total_routes": len(treks_data),
            "total_facilities": len(facilities_data),
            "average_duration_days": round(
                sum(trek["duration_days"] for trek in treks_data) / len(treks_data), 1
            ),
            "longest_route": max(treks_data, key=lambda trek: trek["distance_km"]),
            "highest_route": max(treks_data, key=lambda trek: trek["max_elevation_m"]),
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, port=port)
