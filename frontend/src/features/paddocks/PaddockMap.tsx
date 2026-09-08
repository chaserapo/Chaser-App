import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { MAP_HTML } from "./map-html";

export type PaddockOnMap = {
  id: string;
  name: string;
  area_ha?: number | null;
  crop?: string | null;
  boundary_geojson: { type: "Polygon"; coordinates: number[][][] } | null;
};

export type PaddockMapHandle = {
  setMode: (mode: "view" | "draw") => void;
  undo: () => void;
  clear: () => void;
  save: () => void;
  setPosition: (lat: number, lon: number, recenter?: boolean) => void;
  focusPaddock: (id: string) => void;
};

type Props = {
  paddocks: PaddockOnMap[];
  onSelect?: (id: string) => void;
  onPointsUpdate?: (count: number, areaHa: number) => void;
  onSaveGeometry?: (geojson: { type: "Polygon"; coordinates: number[][][] }, areaHa: number) => void;
  style?: any;
};

export const PaddockMap = forwardRef<PaddockMapHandle, Props>(function PaddockMap(
  { paddocks, onSelect, onPointsUpdate, onSaveGeometry, style }, ref
) {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingPaddocks = useRef<PaddockOnMap[]>(paddocks);
  pendingPaddocks.current = paddocks;

  const send = useCallback((msg: object) => {
    const s = JSON.stringify(msg);
    webviewRef.current?.postMessage(s);
    // Fallback for web platforms: inject directly
    webviewRef.current?.injectJavaScript(`(function(){ try { window.postMessage(${JSON.stringify(s)}, "*"); } catch(e) {} })(); true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    setMode: (mode) => send({ type: "setMode", mode }),
    undo: () => send({ type: "undo" }),
    clear: () => send({ type: "clear" }),
    save: () => send({ type: "save" }),
    setPosition: (lat, lon, recenter) => send({ type: "setPosition", lat, lon, recenter }),
    focusPaddock: (id) => send({ type: "focusPaddock", id }),
  }), [send]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const raw = e.nativeEvent.data;
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "ready":
          readyRef.current = true;
          send({ type: "setPaddocks", paddocks: pendingPaddocks.current });
          break;
        case "select":
          onSelect?.(msg.id);
          break;
        case "points":
          onPointsUpdate?.(msg.count ?? 0, msg.areaHa ?? 0);
          break;
        case "save":
          if (msg.geojson) onSaveGeometry?.(msg.geojson, msg.areaHa ?? 0);
          break;
        case "log":
          // eslint-disable-next-line no-console
          console.log("[map]", msg.msg);
          break;
      }
    } catch { /* ignore */ }
  }, [onSelect, onPointsUpdate, onSaveGeometry, send]);

  // Push updated paddocks whenever the list changes (after ready).
  const paddocksStr = useMemo(() => JSON.stringify(paddocks), [paddocks]);
  const paddocksStrRef = useRef(paddocksStr);
  if (paddocksStrRef.current !== paddocksStr) {
    paddocksStrRef.current = paddocksStr;
    if (readyRef.current) send({ type: "setPaddocks", paddocks });
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html: MAP_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        androidLayerType="hardware"
        style={styles.web}
        setSupportMultipleWindows={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  web: { flex: 1, backgroundColor: "#E8ECE9" },
});
