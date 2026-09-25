// The MapLibre GL JS HTML template rendered inside a WebView.
// - Renders all existing paddock polygons from the `initialPaddocks` payload.
// - Drawing mode: user taps to add points; polyline preview appears; Undo,
//   Clear, and Save exposed via React Native via postMessage.
// - Selection mode: tap a paddock polygon -> posts a `select` message.
// - GPS blue-dot: React Native forwards `setPosition` messages.
//
// Communication protocol (JSON strings):
//   RN  -> WebView: { type: "setPaddocks", paddocks: [...] } |
//                    { type: "setFarmPins", pins: [...] } |
//                    { type: "setIssuePins", pins: [{id,lat,lon,icon,severity}] } |
//                    { type: "setMode", mode: "view"|"draw"|"pin" } |
//                    { type: "undo" | "clear" | "save" | "cancel" } |
//                    { type: "setPosition", lat, lon } |
//                    { type: "setReportPin", lat, lon } | { type: "clearReportPin" } |
//                    { type: "focusPaddock", id } | { type: "flyTo", lat, lon, zoom }
//   WebView -> RN:  { type: "ready" } | { type: "select", id } |
//                    { type: "farmSelect", id } | { type: "issueSelect", id } |
//                    { type: "pinPlaced", lat, lon } |
//                    { type: "points", count } |
//                    { type: "save", geojson, areaHa } |
//                    { type: "log", msg }

export const MAP_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link href="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css" rel="stylesheet" />
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
    .farm-pin {
      display:flex; flex-direction:column; align-items:center; cursor:pointer;
      transform: translateY(-14px);
    }
    .farm-pin .bubble {
      background:#3B6E3B; color:#fff; padding:4px 8px; border-radius:6px;
      font: 700 11px -apple-system, system-ui, sans-serif;
      white-space:nowrap; border:2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35); max-width:160px;
      overflow:hidden; text-overflow:ellipsis;
    }
    .farm-pin .tail {
      width:0; height:0; margin-top:-2px;
      border-left:6px solid transparent; border-right:6px solid transparent;
      border-top:8px solid #3B6E3B;
      filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25));
    }
    .issue-pin {
      width: 30px; height: 30px; border-radius: 999px;
      display:flex; align-items:center; justify-content:center;
      border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      cursor: pointer;
    }
    .issue-pin .mdi { color:#ffffff; font-size: 16px; }
    .report-pin {
      width: 34px; height: 34px; border-radius: 999px 999px 999px 0;
      background:#DC2626; border: 3px solid #ffffff; transform: rotate(-45deg) translate(6px, 6px);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      display:flex; align-items:center; justify-content:center;
    }
    .report-pin .mdi { color:#ffffff; font-size: 16px; transform: rotate(45deg); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@turf/turf@7.1.0/turf.min.js"></script>
  <script>
    const isRN = !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
    const post = (obj) => { try { (isRN ? window.ReactNativeWebView : window.parent).postMessage(JSON.stringify(obj), '*'); } catch(e) {} };
    const log = (msg) => post({ type: 'log', msg: String(msg) });

    const map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
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
      // Default first-open view: Western Australia. Once paddocks or farm pins
      // exist, fitToPaddocks() immediately replaces this with the user's data.
      center: [121.5, -25.8],
      zoom: 4.2,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    // If the map's 'load' event (fired once the style + initial tiles are
    // ready) hasn't happened within LOAD_TIMEOUT_MS — usually a stalled CDN
    // fetch on a weak connection — tell React Native so it can show a retry
    // affordance instead of leaving the user staring at a blank map forever.
    const LOAD_TIMEOUT_MS = 12000;
    let mapLoaded = false;
    setTimeout(() => { if (!mapLoaded) post({ type: 'loadTimeout' }); }, LOAD_TIMEOUT_MS);
    map.on('error', (e) => log((e && e.error && e.error.message) || e));

    // Zoom threshold where the map switches from one broad farm-name bubble
    // per property to individual paddock-name labels once zoomed in close
    // enough to actually distinguish paddocks.
    const PADDOCK_LABEL_MIN_ZOOM = 13;

    let paddocks = [];
    let farmPins = [];      // [{ id, name, lat, lon }]
    let farmMarkers = [];   // parallel maplibre markers
    let issuePins = [];     // [{ id, lat, lon, icon, severity }]
    let issueMarkers = [];
    let reportPin = null;   // [lng, lat] | null — the pin being placed for a new report
    let reportPinMarker = null;
    let mode = 'view'; // 'view' | 'draw' | 'pin'
    let drawPoints = []; // [[lng,lat], ...]
    let pinMarkers = [];
    let gpsMarker = null;
    let fitted = false;
    const severityColor = { low: '#16A34A', medium: '#D97706', high: '#EA580C', critical: '#DC2626' };

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

    // Renders one green "farm" bubble marker per weather_locations pin so
    // operators can see every property on the map even before they've drawn
    // paddock boundaries.
    function renderFarmPins() {
      farmMarkers.forEach(m => m.remove());
      farmMarkers = farmPins.map(p => {
        const wrap = document.createElement('div');
        wrap.className = 'farm-pin';
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = p.name || 'Farm';
        const tail = document.createElement('div');
        tail.className = 'tail';
        wrap.appendChild(bubble);
        wrap.appendChild(tail);
        wrap.addEventListener('click', () => post({ type: 'farmSelect', id: p.id }));
        return new maplibregl.Marker({ element: wrap, anchor: 'bottom' })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
      });
      updateFarmPinVisibility();
    }

    // Broad view: show the farm-name bubble. Zoomed in past
    // PADDOCK_LABEL_MIN_ZOOM: hide it in favour of the individual paddock
    // name labels (a native symbol layer, so it fades in/out on its own).
    function updateFarmPinVisibility() {
      const show = map.getZoom() < PADDOCK_LABEL_MIN_ZOOM;
      farmMarkers.forEach(m => { m.getElement().style.display = show ? '' : 'none'; });
    }
    // Renders one small colored marker per fault/risk report, using the same
    // MDI icon name shown for that category in the native app (loaded via
    // the @mdi/font CDN stylesheet above) so the map stays visually
    // consistent with the rest of Chaser.
    function renderIssuePins() {
      issueMarkers.forEach(m => m.remove());
      issueMarkers = issuePins.map(p => {
        const el = document.createElement('div');
        el.className = 'issue-pin';
        el.style.background = severityColor[p.severity] || '#6B7280';
        const icon = document.createElement('i');
        icon.className = 'mdi mdi-' + (p.icon || 'map-marker');
        el.appendChild(icon);
        el.addEventListener('click', () => post({ type: 'issueSelect', id: p.id }));
        return new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
      });
    }

    // The single "drop pin" marker shown while placing/confirming the
    // location for a new fault/risk report.
    function renderReportPin() {
      if (reportPinMarker) { reportPinMarker.remove(); reportPinMarker = null; }
      if (!reportPin) return;
      const el = document.createElement('div');
      el.className = 'report-pin';
      const icon = document.createElement('i');
      icon.className = 'mdi mdi-map-marker';
      el.appendChild(icon);
      reportPinMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(reportPin)
        .addTo(map);
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
      let bboxSource = null;
      if (g.features.length > 0) {
        bboxSource = g;
      } else if (farmPins.length > 0) {
        // No paddock polygons yet — fit around the farm pins instead so the
        // user sees their properties on first open.
        bboxSource = {
          type: 'FeatureCollection',
          features: farmPins.map(p => ({
            type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: {}
          }))
        };
      }
      if (!bboxSource) return;
      try {
        const bbox = turf.bbox(bboxSource);
        map.fitBounds(bbox, { padding: 60, duration: 0, maxZoom: farmPins.length && !g.features.length ? 12 : 15 });
        fitted = true;
      } catch (e) { log(e); }
    }

    map.on('load', () => {
      mapLoaded = true;
      map.addSource('paddocks', { type: 'geojson', data: paddockGeoJSON() });
      map.addLayer({ id: 'paddocks-fill', type: 'fill', source: 'paddocks',
        paint: { 'fill-color': '#3B6E3B', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'paddocks-line', type: 'line', source: 'paddocks',
        paint: { 'line-color': '#3B6E3B', 'line-width': 2 } });
      // Individual paddock name labels — only kick in once zoomed in close
      // enough to tell paddocks apart; see PADDOCK_LABEL_MIN_ZOOM above.
      map.addLayer({ id: 'paddocks-label', type: 'symbol', source: 'paddocks',
        minzoom: PADDOCK_LABEL_MIN_ZOOM,
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Open Sans Bold'] },
        paint: { 'text-color': '#1F2937', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } });

      map.on('zoom', updateFarmPinVisibility);

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
        } else if (mode === 'pin') {
          reportPin = [e.lngLat.lng, e.lngLat.lat];
          renderReportPin();
          post({ type: 'pinPlaced', lat: e.lngLat.lat, lon: e.lngLat.lng });
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
        case 'setFarmPins': farmPins = msg.pins || []; if (map.loaded()) { renderFarmPins(); fitToPaddocks(); } break;
        case 'setIssuePins': issuePins = msg.pins || []; if (map.loaded()) renderIssuePins(); break;
        case 'setReportPin':
          if (typeof msg.lon === 'number' && typeof msg.lat === 'number') {
            reportPin = [msg.lon, msg.lat];
            renderReportPin();
            map.easeTo({ center: [msg.lon, msg.lat], zoom: Math.max(map.getZoom(), 15) });
          }
          break;
        case 'clearReportPin': reportPin = null; renderReportPin(); break;
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
        case 'flyTo':
          if (typeof msg.lon === 'number' && typeof msg.lat === 'number') {
            map.easeTo({ center: [msg.lon, msg.lat], zoom: msg.zoom || 14 });
          }
          break;
      }
    }

    document.addEventListener('message', (e) => handleMessage(e.data));
    window.addEventListener('message', (e) => handleMessage(e.data));
  </script>
</body>
</html>
`;
