// The MapLibre GL JS HTML template rendered inside a WebView.
// - Renders all existing paddock polygons from the `initialPaddocks` payload.
// - Drawing mode: user taps to add points; polyline preview appears; Undo,
//   Clear, and Save exposed via React Native via postMessage.
// - Selection mode: tap a paddock polygon -> posts a `select` message.
// - GPS blue-dot: React Native forwards `setPosition` messages.
//
// Communication protocol (JSON strings):
//   RN  -> WebView: { type: "setPaddocks", paddocks: [...] } |
//                    { type: "setMode", mode: "view"|"draw" } |
//                    { type: "undo" | "clear" | "save" | "cancel" } |
//                    { type: "setPosition", lat, lon } |
//                    { type: "focusPaddock", id }
//   WebView -> RN:  { type: "ready" } | { type: "select", id } |
//                    { type: "points", count } |
//                    { type: "save", geojson, areaHa } |
//                    { type: "log", msg }

export const MAP_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; touch-action: none; background: #E8ECE9; }
    .pin {
      width: 14px; height: 14px; border-radius: 999px; background:#3B6E3B;
      border: 2px solid #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.4); cursor: grab;
    }
    .gps-dot {
      width: 16px; height: 16px; border-radius: 999px; background:#2563EB;
      border: 3px solid #ffffff; box-shadow: 0 0 0 6px rgba(37,99,235,0.2);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/@turf/turf@7.1.0/turf.min.js"></script>
  <script>
    const isRN = !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
    const post = (obj) => { try { (isRN ? window.ReactNativeWebView : window.parent).postMessage(JSON.stringify(obj), '*'); } catch(e) {} };
    const log = (msg) => post({ type: 'log', msg: String(msg) });

    const map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: [149.13, -35.28],
      zoom: 5,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    let paddocks = [];
    let mode = 'view'; // 'view' | 'draw'
    let drawPoints = []; // [[lng,lat], ...]
    let pinMarkers = [];
    let gpsMarker = null;
    let fitted = false;

    function paddockGeoJSON() {
      return {
        type: 'FeatureCollection',
        features: paddocks
          .filter(p => p.boundary_geojson)
          .map(p => ({
            type: 'Feature',
            id: p.id,
            properties: { id: p.id, name: p.name, area_ha: p.area_ha, crop: p.crop || '' },
            geometry: p.boundary_geojson
          }))
      };
    }

    function drawingGeoJSON() {
      const outline = drawPoints.length >= 2 ? { type: 'LineString', coordinates: drawPoints } : null;
      const closed = drawPoints.length >= 3
        ? { type: 'Polygon', coordinates: [[...drawPoints, drawPoints[0]]] }
        : null;
      return {
        outline: outline ? { type: 'Feature', geometry: outline, properties: {} } : { type: 'FeatureCollection', features: [] },
        fill: closed ? { type: 'Feature', geometry: closed, properties: {} } : { type: 'FeatureCollection', features: [] },
      };
    }

    function renderPaddocks() {
      const src = map.getSource('paddocks');
      if (src) src.setData(paddockGeoJSON());
    }
    function renderDrawing() {
      const g = drawingGeoJSON();
      const s1 = map.getSource('draw-fill'); if (s1) s1.setData(g.fill);
      const s2 = map.getSource('draw-outline'); if (s2) s2.setData(g.outline);
      // pins
      pinMarkers.forEach(m => m.remove());
      pinMarkers = drawPoints.map((pt, idx) => {
        const el = document.createElement('div'); el.className = 'pin';
        const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(pt).addTo(map);
        marker.on('dragend', () => {
          const c = marker.getLngLat(); drawPoints[idx] = [c.lng, c.lat]; renderDrawing(); postPointsUpdate();
        });
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); drawPoints.splice(idx,1); renderDrawing(); postPointsUpdate(); });
        // Long press to remove (500ms)
        let pressTimer = null;
        const startPress = () => { pressTimer = setTimeout(() => { drawPoints.splice(idx,1); renderDrawing(); postPointsUpdate(); }, 500); };
        const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        el.addEventListener('touchstart', startPress);
        el.addEventListener('touchend', cancelPress);
        el.addEventListener('touchmove', cancelPress);
        return marker;
      });
    }

    function postPointsUpdate() {
      const closed = drawPoints.length >= 3 ? [...drawPoints, drawPoints[0]] : null;
      const areaHa = closed ? turf.area(turf.polygon([closed])) / 10000 : 0;
      post({ type: 'points', count: drawPoints.length, areaHa });
    }

    function computeArea() {
      if (drawPoints.length < 3) return 0;
      const coords = [...drawPoints, drawPoints[0]];
      return turf.area(turf.polygon([coords])) / 10000;
    }

    function fitToPaddocks() {
      if (fitted) return;
      const g = paddockGeoJSON();
      if (g.features.length === 0) return;
      try {
        const bbox = turf.bbox(g);
        map.fitBounds(bbox, { padding: 40, duration: 0, maxZoom: 15 });
        fitted = true;
      } catch (e) { log(e); }
    }

    map.on('load', () => {
      map.addSource('paddocks', { type: 'geojson', data: paddockGeoJSON() });
      map.addLayer({ id: 'paddocks-fill', type: 'fill', source: 'paddocks',
        paint: { 'fill-color': '#3B6E3B', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'paddocks-line', type: 'line', source: 'paddocks',
        paint: { 'line-color': '#3B6E3B', 'line-width': 2 } });

      map.addSource('draw-fill', { type: 'geojson', data: drawingGeoJSON().fill });
      map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-fill',
        paint: { 'fill-color': '#EAB308', 'fill-opacity': 0.25 } });
      map.addSource('draw-outline', { type: 'geojson', data: drawingGeoJSON().outline });
      map.addLayer({ id: 'draw-outline', type: 'line', source: 'draw-outline',
        paint: { 'line-color': '#EAB308', 'line-width': 3, 'line-dasharray': [1.5, 1.5] } });

      map.on('click', (e) => {
        if (mode === 'draw') {
          drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
          renderDrawing(); postPointsUpdate();
        } else {
          const feats = map.queryRenderedFeatures(e.point, { layers: ['paddocks-fill'] });
          if (feats && feats.length) post({ type: 'select', id: feats[0].properties.id });
        }
      });
      post({ type: 'ready' });
      fitToPaddocks();
    });

    function handleMessage(raw) {
      let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
      switch (msg.type) {
        case 'setPaddocks': paddocks = msg.paddocks || []; if (map.loaded()) { renderPaddocks(); fitToPaddocks(); } break;
        case 'setMode':
          mode = msg.mode;
          if (mode === 'view') { drawPoints = []; renderDrawing(); postPointsUpdate(); }
          break;
        case 'undo': drawPoints.pop(); renderDrawing(); postPointsUpdate(); break;
        case 'clear': drawPoints = []; renderDrawing(); postPointsUpdate(); break;
        case 'addPoint':
          if (typeof msg.lon === 'number' && typeof msg.lat === 'number') {
            drawPoints.push([msg.lon, msg.lat]);
            renderDrawing(); postPointsUpdate();
          }
          break;
        case 'save':
          if (drawPoints.length < 3) { post({ type: 'save', error: 'Need at least 3 points' }); return; }
          const coords = [...drawPoints, drawPoints[0]];
          const areaHa = turf.area(turf.polygon([coords])) / 10000;
          post({ type: 'save', geojson: { type: 'Polygon', coordinates: [coords] }, areaHa });
          break;
        case 'setPosition':
          if (!gpsMarker) {
            const el = document.createElement('div'); el.className = 'gps-dot';
            gpsMarker = new maplibregl.Marker({ element: el }).setLngLat([msg.lon, msg.lat]).addTo(map);
          } else {
            gpsMarker.setLngLat([msg.lon, msg.lat]);
          }
          if (msg.recenter) map.easeTo({ center: [msg.lon, msg.lat], zoom: Math.max(map.getZoom(), 14) });
          break;
        case 'focusPaddock': {
          const p = paddocks.find(x => x.id === msg.id);
          if (p && p.boundary_geojson) {
            try { const bbox = turf.bbox(p.boundary_geojson); map.fitBounds(bbox, { padding: 60, maxZoom: 16 }); } catch (e) {}
          }
          break;
        }
      }
    }

    document.addEventListener('message', (e) => handleMessage(e.data));
    window.addEventListener('message', (e) => handleMessage(e.data));
  </script>
</body>
</html>
`;
