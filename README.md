# Trek Nepal Smart System

A beginner-friendly full stack WebGIS mini project for the WebGIS subject.

## Features

- Python Flask backend with API routes.
- Modern HTML, CSS and JavaScript frontend.
- Interactive Leaflet map.
- Topography, satellite, street and dark map layers.
- Trek route filtering by difficulty, season and duration.
- Route analysis: distance, duration, maximum elevation, permits and travel guidance.

## Run locally

```powershell
python -m pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5001` in your browser.

## API endpoints

- `/api/treks` returns all trekking routes.
- `/api/treks?difficulty=easy&season=spring&max_days=7` filters routes.
- `/api/treks/<trek_id>` returns one route.
- `/api/stats` returns project statistics.

## Suggested project explanation

This project demonstrates how WebGIS can support trekking route planning in Nepal. The backend stores route information and exposes it through API endpoints. The frontend consumes these APIs and visualizes routes on an interactive map. Users can switch base maps, filter trekking options, compare route attributes and view travel guidance.

## Deployment idea for `.com.np`

Host the Flask app on a Python-friendly platform such as Render, Railway, PythonAnywhere or a VPS. Then point your `.com.np` DNS records to the hosting provider. For a student project, Render or PythonAnywhere is usually easiest.

## GPS live location

The GPS button uses the browser Geolocation API. It asks the visitor for permission, then shows their live position and accuracy circle on the map. This works on localhost during development and requires HTTPS after deployment to a public domain.

