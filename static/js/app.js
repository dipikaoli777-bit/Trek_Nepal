const nepalCenter = [28.25, 84.1];
const routeColors = {
  Easy: "#12805c",
  Moderate: "#c98d18",
  Hard: "#b94b38"
};
const facilityStyles = {
  Homestay: { color: "#047f73", label: "H" },
  Clinic: { color: "#b94b38", label: "+" },
  Waterfall: { color: "#2d7dd2", label: "W" },
  Viewpoint: { color: "#c98d18", label: "V" },
  Water: { color: "#168aad", label: "T" },
  Shelter: { color: "#5d5fef", label: "S" },
  Checkpost: { color: "#4d5965", label: "C" },
  Food: { color: "#7a4f1d", label: "F" },
  "Hot Spring": { color: "#d76a03", label: "H" }
};

const layers = {
  topography: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: "Map data: OpenStreetMap contributors, SRTM | OpenTopoMap"
  }),
  satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 18,
      attribution: "Tiles: Esri, Maxar, Earthstar Geographics"
    }
  ),
  streets: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "OpenStreetMap contributors"
  }),
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "OpenStreetMap contributors, CARTO"
  })
};

const map = L.map("map", {
  center: nepalCenter,
  zoom: 7,
  layers: [layers.topography],
  zoomControl: false
});

L.control.zoom({ position: "bottomleft" }).addTo(map);

let activeLayer = layers.topography;
let routeGroup = L.featureGroup().addTo(map);
let facilityGroup = L.featureGroup().addTo(map);
let bufferGroup = L.featureGroup().addTo(map);
let routeLookup = new Map();
let allFacilities = [];
let selectedRouteId = null;
let selectedBufferFacilities = [];
let gpsWatchId = null;
let userMarker = null;
let userAccuracyCircle = null;

const routeList = document.querySelector("#routeList");
const infoPanel = document.querySelector("#infoPanel");
const difficultyFilter = document.querySelector("#difficultyFilter");
const seasonFilter = document.querySelector("#seasonFilter");
const daysFilter = document.querySelector("#daysFilter");
const daysValue = document.querySelector("#daysValue");
const bufferRadius = document.querySelector("#bufferRadius");
const bufferValue = document.querySelector("#bufferValue");
const bufferSummary = document.querySelector("#bufferSummary");
const facilitiesToggle = document.querySelector("#facilitiesToggle");
const elevationCanvas = document.querySelector("#elevationChart");
const chartTitle = document.querySelector("#chartTitle");
const chartRange = document.querySelector("#chartRange");
const locateUserButton = document.querySelector("#locateUser");
const gpsStatus = document.querySelector("#gpsStatus");

function toLatLngs(coordinates) {
  return coordinates.map(([lng, lat]) => [lat, lng]);
}

function difficultyClass(difficulty) {
  return difficulty.toLowerCase();
}

function facilityStyle(type) {
  return facilityStyles[type] || { color: "#4d5965", label: "P" };
}

function setGpsStatus(message, status = "idle") {
  gpsStatus.textContent = message;
  gpsStatus.dataset.status = status;
}

function updateUserLocation(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const latLng = [latitude, longitude];

  if (!userMarker) {
    const icon = L.divIcon({
      className: "",
      html: '<div class="user-location-marker"><span></span></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    userMarker = L.marker(latLng, { icon }).addTo(map);
    userMarker.bindPopup("You are here");
  } else {
    userMarker.setLatLng(latLng);
  }

  if (!userAccuracyCircle) {
    userAccuracyCircle = L.circle(latLng, {
      radius: accuracy,
      color: "#155eef",
      weight: 2,
      fillColor: "#155eef",
      fillOpacity: 0.12
    }).addTo(map);
  } else {
    userAccuracyCircle.setLatLng(latLng);
    userAccuracyCircle.setRadius(accuracy);
  }

  userMarker.setPopupContent(`You are here<br>Accuracy: ${Math.round(accuracy)} m`);
  setGpsStatus(`GPS active - accuracy ${Math.round(accuracy)} m`, "active");
}

function stopGpsTracking(message = "GPS is off", status = "idle") {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }

  locateUserButton.classList.remove("active");
  locateUserButton.textContent = "GPS";
  setGpsStatus(message, status);
}

function startGpsTracking() {
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (window.location.protocol !== "https:" && !isLocalhost) {
    setGpsStatus("GPS requires HTTPS after deployment. Use localhost while developing.", "error");
    return;
  }

  if (!navigator.geolocation) {
    setGpsStatus("GPS is not supported by this browser.", "error");
    return;
  }

  locateUserButton.classList.add("active");
  locateUserButton.textContent = "GPS On";
  setGpsStatus("Requesting location permission...", "loading");

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      updateUserLocation(position);
      map.setView([position.coords.latitude, position.coords.longitude], Math.max(map.getZoom(), 14));
    },
    (error) => {
      const messages = {
        1: "Location permission denied.",
        2: "Location unavailable. Check device GPS or internet.",
        3: "Location request timed out."
      };
      stopGpsTracking(messages[error.code] || "Could not get your location.", "error");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000
    }
  );
}
function updateStats() {
  fetch("/api/stats")
    .then((response) => response.json())
    .then((stats) => {
      document.querySelector("#totalRoutes").textContent = stats.total_routes;
      document.querySelector("#avgDays").textContent = stats.average_duration_days;
      document.querySelector("#highestRoute").textContent = `${stats.highest_route.max_elevation_m} m`;
      document.querySelector("#totalFacilities").textContent = stats.total_facilities;
    });
}

function renderRouteList(routes) {
  if (!routes.length) {
    routeList.innerHTML = '<div class="empty-state">No route matches the selected filters.</div>';
    return;
  }

  routeList.innerHTML = routes
    .map(
      (route) => `
        <button class="route-card ${route.id === selectedRouteId ? "active" : ""}" type="button" data-id="${route.id}">
          <h3>${route.name}</h3>
          <div class="route-meta">
            <span class="pill ${difficultyClass(route.difficulty)}">${route.difficulty}</span>
            <span>${route.duration_days} days</span>
            <span>${route.distance_km} km</span>
            <span>${route.max_elevation_m} m</span>
          </div>
        </button>
      `
    )
    .join("");

  routeList.querySelectorAll(".route-card").forEach((button) => {
    button.addEventListener("click", () => selectRoute(button.dataset.id));
  });
}

function renderRoutes(routes) {
  routeGroup.clearLayers();
  routeLookup.clear();

  routes.forEach((route) => {
    const latLngs = toLatLngs(route.coordinates);
    const color = routeColors[route.difficulty] || "#047f73";
    const polyline = L.polyline(latLngs, {
      color,
      weight: 5,
      opacity: 0.88
    }).addTo(routeGroup);

    const startMarker = L.circleMarker(latLngs[0], {
      radius: 7,
      color,
      fillColor: "#ffffff",
      fillOpacity: 1,
      weight: 3
    }).addTo(routeGroup);

    const endMarker = L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 8,
      color: "#17212b",
      fillColor: color,
      fillOpacity: 1,
      weight: 2
    }).addTo(routeGroup);

    [polyline, startMarker, endMarker].forEach((layer) => {
      layer.bindPopup(`<strong>${route.name}</strong><br>${route.region}<br>${route.distance_km} km`);
      layer.on("click", () => selectRoute(route.id));
    });

    routeLookup.set(route.id, { route, polyline });
  });

  if (routes.length) {
    map.fitBounds(routeGroup.getBounds(), { padding: [45, 45] });
  }
}

function facilityMarker(facility) {
  const style = facilityStyle(facility.type);
  const icon = L.divIcon({
    className: "",
    html: `<div class="facility-marker" style="background:${style.color}">${style.label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13]
  });

  return L.marker([facility.coordinates[1], facility.coordinates[0]], { icon }).bindPopup(
    `<strong>${facility.name}</strong><br>${facility.type}<br>${facility.description}${
      facility.distance_from_route_km !== undefined ? `<br>${facility.distance_from_route_km} km from route` : ""
    }`
  );
}

function renderFacilities(facilities) {
  facilityGroup.clearLayers();
  if (!facilitiesToggle.checked) return;

  facilities.forEach((facility) => {
    facilityMarker(facility).addTo(facilityGroup);
  });
}

function renderBuffer(route) {
  bufferGroup.clearLayers();
  const radiusMeters = Number(bufferRadius.value) * 1000;
  toLatLngs(route.coordinates).forEach((latLng) => {
    L.circle(latLng, {
      radius: radiusMeters,
      color: "#047f73",
      weight: 1,
      fillColor: "#047f73",
      fillOpacity: 0.08,
      interactive: false
    }).addTo(bufferGroup);
  });
}

function renderNearbyList(facilities) {
  if (!facilities.length) {
    return '<div class="empty-state">No mapped places found within this buffer.</div>';
  }

  return `
    <div class="nearby-list">
      ${facilities
        .slice(0, 6)
        .map(
          (facility) => `
            <div class="nearby-item">
              <span>${facility.name}</span>
              <strong>${facility.distance_from_route_km} km</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSuggestionTabs(route) {
  const temp = route.estimated_temperature_c;
  const suggestions = route.suggestions;
  return `
    <div class="suggestion-box">
      <div class="suggestion-head">
        <strong>Estimated route temperature</strong>
        <span>${temp.min_c} C to ${temp.max_c} C</span>
      </div>
      <div class="suggestion-tabs" role="tablist" aria-label="Trek preparation suggestions">
        <button class="suggestion-tab active" type="button" data-tab="clothes">Clothes</button>
        <button class="suggestion-tab" type="button" data-tab="medicines">Medicines</button>
        <button class="suggestion-tab" type="button" data-tab="other">Other</button>
      </div>
      <div class="suggestion-content" id="suggestionContent">
        ${suggestions.clothes.map((item) => `<p>${item}</p>`).join("")}
      </div>
    </div>
  `;
}

function attachSuggestionTabs(route) {
  const tabButtons = infoPanel.querySelectorAll(".suggestion-tab");
  const content = infoPanel.querySelector("#suggestionContent");
  if (!tabButtons.length || !content) return;

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const list = route.suggestions[button.dataset.tab] || [];
      content.innerHTML = list.map((item) => `<p>${item}</p>`).join("");
    });
  });
}

function renderInfo(route, nearbyFacilities = selectedBufferFacilities) {
  infoPanel.innerHTML = `
    <p class="eyebrow">${route.region}</p>
    <h2>${route.name}</h2>
    <p>${route.summary}</p>
    <div class="info-grid">
      <div><strong>Distance</strong><span>${route.distance_km} km</span></div>
      <div><strong>Duration</strong><span>${route.duration_days} days</span></div>
      <div><strong>Max elevation</strong><span>${route.max_elevation_m} m</span></div>
      <div><strong>Difficulty</strong><span>${route.difficulty}</span></div>
    </div>
    <p><strong>Start:</strong> ${route.start} &nbsp; <strong>End:</strong> ${route.end}</p>
    <p><strong>Permit:</strong> ${route.permit}</p>
    <p><strong>Best seasons:</strong> ${route.best_seasons.join(", ")}</p>
    ${renderSuggestionTabs(route)}
    <p><strong>Nearby places inside buffer:</strong></p>
    ${renderNearbyList(nearbyFacilities)}
    <ul class="guidance">
      ${route.guidance.map((item) => `<li>${item}</li>`).join("")}
    </ul>
  `;
  attachSuggestionTabs(route);
}

function drawElevationChart(route) {
  const ctx = elevationCanvas.getContext("2d");
  const width = elevationCanvas.width;
  const height = elevationCanvas.height;
  const padding = 28;
  const profile = route ? route.elevation_profile : [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!profile.length) {
    chartTitle.textContent = "Select a route";
    chartRange.textContent = "0 m";
    ctx.fillStyle = "#64707d";
    ctx.font = "16px Segoe UI, Arial";
    ctx.fillText("Select a route to view elevation.", padding, height / 2);
    return;
  }

  const minElevation = Math.min(...profile);
  const maxElevation = Math.max(...profile);
  const range = Math.max(maxElevation - minElevation, 1);
  const stepX = (width - padding * 2) / (profile.length - 1);
  const points = profile.map((elevation, index) => {
    const x = padding + index * stepX;
    const y = height - padding - ((elevation - minElevation) / range) * (height - padding * 2);
    return [x, y];
  });

  chartTitle.textContent = route.name;
  chartRange.textContent = `${minElevation} - ${maxElevation} m`;

  ctx.strokeStyle = "#dbe3e9";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding + i * ((height - padding * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
  gradient.addColorStop(0, "rgba(4, 127, 115, 0.34)");
  gradient.addColorStop(1, "rgba(4, 127, 115, 0.03)");
  ctx.beginPath();
  ctx.moveTo(points[0][0], height - padding);
  points.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(points[points.length - 1][0], height - padding);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#047f73";
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#047f73";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = "#64707d";
  ctx.font = "12px Segoe UI, Arial";
  ctx.fillText(`${maxElevation} m`, padding, padding - 8);
  ctx.fillText(`${minElevation} m`, padding, height - 8);
}

function highlightRoute(routeId) {
  routeLookup.forEach(({ route, polyline }) => {
    const isSelected = route.id === routeId;
    polyline.setStyle({
      weight: isSelected ? 8 : 5,
      opacity: isSelected ? 1 : 0.72
    });
    if (isSelected) {
      polyline.bringToFront();
      map.fitBounds(polyline.getBounds(), { padding: [80, 80] });
    }
  });

  document.querySelectorAll(".route-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.id === routeId);
  });
}

function runBufferAnalysis(route) {
  bufferValue.textContent = bufferRadius.value;
  renderBuffer(route);
  bufferSummary.textContent = "Running buffer analysis...";

  fetch(`/api/treks/${route.id}/buffer?radius_km=${bufferRadius.value}`)
    .then((response) => response.json())
    .then((result) => {
      selectedBufferFacilities = result.facilities;
      bufferSummary.textContent = `${result.facility_count} mapped places found within ${result.radius_km} km of ${route.name}.`;
      renderFacilities(selectedBufferFacilities);
      renderInfo(route, selectedBufferFacilities);
    });
}

function selectRoute(routeId) {
  const selected = routeLookup.get(routeId);
  if (!selected) return;

  selectedRouteId = routeId;
  selectedBufferFacilities = [];
  renderInfo(selected.route, []);
  highlightRoute(routeId);
  drawElevationChart(selected.route);
  runBufferAnalysis(selected.route);
}

function loadRoutes() {
  daysValue.textContent = daysFilter.value;
  const params = new URLSearchParams({
    difficulty: difficultyFilter.value,
    season: seasonFilter.value,
    max_days: daysFilter.value
  });

  fetch(`/api/treks?${params.toString()}`)
    .then((response) => response.json())
    .then((routes) => {
      if (!routes.some((route) => route.id === selectedRouteId)) {
        selectedRouteId = null;
        selectedBufferFacilities = [];
        bufferGroup.clearLayers();
        renderFacilities(allFacilities);
        drawElevationChart(null);
      }
      renderRoutes(routes);
      renderRouteList(routes);
      if (!selectedRouteId) {
        bufferSummary.textContent = "Select a route to run buffer analysis.";
      }
    });
}

function loadFacilities() {
  fetch("/api/facilities")
    .then((response) => response.json())
    .then((facilities) => {
      allFacilities = facilities;
      renderFacilities(allFacilities);
    });
}

document.querySelectorAll(".layer-button[data-layer]").forEach((button) => {
  button.addEventListener("click", () => {
    map.removeLayer(activeLayer);
    activeLayer = layers[button.dataset.layer];
    activeLayer.addTo(map);

    document.querySelectorAll(".layer-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

locateUserButton.addEventListener("click", () => {
  if (gpsWatchId === null) {
    startGpsTracking();
  } else {
    stopGpsTracking();
  }
});

[difficultyFilter, seasonFilter, daysFilter].forEach((control) => {
  control.addEventListener("input", loadRoutes);
});

bufferRadius.addEventListener("input", () => {
  bufferValue.textContent = bufferRadius.value;
  if (selectedRouteId) {
    runBufferAnalysis(routeLookup.get(selectedRouteId).route);
  }
});

facilitiesToggle.addEventListener("change", () => {
  if (selectedRouteId) {
    renderFacilities(selectedBufferFacilities);
  } else {
    renderFacilities(allFacilities);
  }
});

document.querySelector("#resetView").addEventListener("click", () => {
  difficultyFilter.value = "all";
  seasonFilter.value = "all";
  daysFilter.value = "18";
  bufferRadius.value = "3";
  daysValue.textContent = "18";
  bufferValue.textContent = "3";
  selectedRouteId = null;
  selectedBufferFacilities = [];
  bufferGroup.clearLayers();
  renderFacilities(allFacilities);
  drawElevationChart(null);
  bufferSummary.textContent = "Select a route to run buffer analysis.";
  infoPanel.innerHTML = `
    <p class="eyebrow">Selected route</p>
    <h2>Choose a trek route</h2>
    <p>Click a route from the list or map to view distance, elevation, nearby places, buffer analysis and travel guidance.</p>
  `;
  loadRoutes();
});

updateStats();
loadFacilities();
drawElevationChart(null);
loadRoutes();




