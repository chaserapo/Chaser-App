import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { MAP_HTML } from "./map-html";
import { listFarmIssues } from "@/src/lib/issues";

export type PaddockOnMap = {
  id: string;
  name: string;
  area_ha?: number | null;
  crop?: string | null;
  boundary_geojson: { type: "Polygon"; coordinates: number[][][] } | null;
};

export type FarmPin = { id: string; name: string; lat: number; lon: number };
export type IssuePin = { id: string; title: string; category: string; lat: number; lon: number; severity?: string | null };

export type PaddockMapHandle = {
  setMode: (mode: "view" | "draw") => void;
  undo: () => void;
  clear: () => void;
  save: () => void;
  addPoint: (lat: number, lon: number) => void;
  setPosition: (lat: number, lon: number, recenter?: boolean) => void;
  focusPaddock: (id: string) => void;
};

type Props = {
  paddocks: PaddockOnMap[];
  farmPins?: FarmPin[];
  onSelect?: (id: string) => void;
  onFarmSelect?: (id: string) => void;
  onPointsUpdate?: (count: number, areaHa: number) => void;
  onSaveGeometry?: (geojson: { type: "Polygon"; coordinates: number[][][] }, areaHa: number) => void;
  style?: any;
};

type MapProps = Props & { issuePins: IssuePin[] };

const WebMap = forwardRef<PaddockMapHandle, MapProps>(function WebMap(
  { paddocks, farmPins, issuePins, onSelect, onFarmSelect, onPointsUpdate, onSaveGeometry, style }, ref
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const pending = useRef(paddocks);
  pending.current = paddocks;
  const pendingPins = useRef(farmPins ?? []);
  pendingPins.current = farmPins ?? [];
  const pendingIssues = useRef(issuePins);
  pendingIssues.current = issuePins;

  const send = useCallback((msg: object) => {
    const s = JSON.stringify(msg);
    iframeRef.current?.contentWindow?.postMessage(s, "*");
  }, []);

  useImperativeHandle(ref, () => ({
    setMode: (mode) => send({ type: "setMode", mode }),
    undo: () => send({ type: "undo" }),
    clear: () => send({ type: "clear" }),
    save: () => send({ type: "save" }),
    addPoint: (lat, lon) => send({ type: "addPoint", lat, lon }),
    setPosition: (lat, lon, recenter) => send({ type: "setPosition", lat, lon, recenter }),
    focusPaddock: (id) => send({ type: "focusPaddock", id }),
  }), [send]);

  useEffect(() => {
    function handler(e: MessageEvent) {
      if (typeof e.data !== "string") return;
      let msg: any; try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "ready":
          readyRef.current = true;
          send({ type: "setPaddocks", paddocks: pending.current });
          send({ type: "setFarmPins", pins: pendingPins.current });
          send({ type: "setIssuePins", pins: pendingIssues.current });
          break;
        case "select": onSelect?.(msg.id); break;
        case "farmSelect": onFarmSelect?.(msg.id); break;
        case "points": onPointsUpdate?.(msg.count ?? 0, msg.areaHa ?? 0); break;
        case "save": if (msg.geojson) onSaveGeometry?.(msg.geojson, msg.areaHa ?? 0); break;
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [send, onSelect, onFarmSelect, onPointsUpdate, onSaveGeometry]);

  const paddocksStr = useMemo(() => JSON.stringify(paddocks), [paddocks]);
  const lastStr = useRef(paddocksStr);
  if (lastStr.current !== paddocksStr) {
    lastStr.current = paddocksStr;
    if (readyRef.current) send({ type: "setPaddocks", paddocks });
  }
  const pinsStr = useMemo(() => JSON.stringify(farmPins ?? []), [farmPins]);
  const lastPinsStr = useRef(pinsStr);
  if (lastPinsStr.current !== pinsStr) {
    lastPinsStr.current = pinsStr;
    if (readyRef.current) send({ type: "setFarmPins", pins: farmPins ?? [] });
  }
  const issuesStr = useMemo(() => JSON.stringify(issuePins), [issuePins]);
  const lastIssuesStr = useRef(issuesStr);
  if (lastIssuesStr.current !== issuesStr) {
    lastIssuesStr.current = issuesStr;
    if (readyRef.current) send({ type: "setIssuePins", pins: issuePins });
  }

  return (
    <View style={[styles.container, style]}>
      {/* @ts-expect-error web-only element */}
      <iframe ref={iframeRef} srcDoc={MAP_HTML} style={{ width: "100%", height: "100%", border: 0, background: "#E8ECE9" }} />
    </View>
  );
});

const NativeMap = forwardRef<PaddockMapHandle, MapProps>(function NativeMap(
  { paddocks, farmPins, issuePins, onSelect, onFarmSelect, onPointsUpdate, onSaveGeometry, style }, ref
) {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingPaddocks = useRef<PaddockOnMap[]>(paddocks);
  pendingPaddocks.current = paddocks;
  const pendingPins = useRef<FarmPin[]>(farmPins ?? []);
  pendingPins.current = farmPins ?? [];
  const pendingIssues = useRef<IssuePin[]>(issuePins);
  pendingIssues.current = issuePins;

  const send = useCallback((msg: object) => {
    const s = JSON.stringify(msg);
    webviewRef.current?.postMessage(s);
    webviewRef.current?.injectJavaScript(`(function(){ try { window.postMessage(${JSON.stringify(s)}, "*"); } catch(e) {} })(); true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    setMode: (mode) => send({ type: "setMode", mode }),
    undo: () => send({ type: "undo" }),
    clear: () => send({ type: "clear" }),
    save: () => send({ type: "save" }),
    addPoint: (lat, lon) => send({ type: "addPoint", lat, lon }),
    setPosition: (lat, lon, recenter) => send({ type: "setPosition", lat, lon, recenter }),
    focusPaddock: (id) => send({ type: "focusPaddock", id }),
  }), [send]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      switch (msg.type) {
        case "ready":
          readyRef.current = true;
          send({ type: "setPaddocks", paddocks: pendingPaddocks.current });
          send({ type: "setFarmPins", pins: pendingPins.current });
          send({ type: "setIssuePins", pins: pendingIssues.current });
          break;
        case "select": onSelect?.(msg.id); break;
        case "farmSelect": onFarmSelect?.(msg.id); break;
        case "points": onPointsUpdate?.(msg.count ?? 0, msg.areaHa ?? 0); break;
        case "save": if (msg.geojson) onSaveGeometry?.(msg.geojson, msg.areaHa ?? 0); break;
      }
    } catch { /* ignore */ }
  }, [onSelect, onFarmSelect, onPointsUpdate, onSaveGeometry, send]);

  const paddocksStr = useMemo(() => JSON.stringify(paddocks), [paddocks]);
  const paddocksStrRef = useRef(paddocksStr);
  if (paddocksStrRef.current !== paddocksStr) {
    paddocksStrRef.current = paddocksStr;
    if (readyRef.current) send({ type: "setPaddocks", paddocks });
  }
  const pinsStr = useMemo(() => JSON.stringify(farmPins ?? []), [farmPins]);
  const pinsStrRef = useRef(pinsStr);
  if (pinsStrRef.current !== pinsStr) {
    pinsStrRef.current = pinsStr;
    if (readyRef.current) send({ type: "setFarmPins", pins: farmPins ?? [] });
  }
  const issuesStr = useMemo(() => JSON.stringify(issuePins), [issuePins]);
  const issuesStrRef = useRef(issuesStr);
  if (issuesStrRef.current !== issuesStr) {
    issuesStrRef.current = issuesStr;
    if (readyRef.current) send({ type: "setIssuePins", pins: issuePins });
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

export const PaddockMap = forwardRef<PaddockMapHandle, Props>(function PaddockMap(props, ref) {
  const [issuePins, setIssuePins] = useState<IssuePin[]>([]);

  useEffect(() => {
    let active = true;
    listFarmIssues()
      .then((issues) => {
        if (!active) return;
        setIssuePins(
          issues
            .filter((i) => !["resolved", "closed"].includes(i.status) && i.latitude != null && i.longitude != null)
            .map((i) => ({
              id: i.id,
              title: i.title,
              category: i.category,
              lat: i.latitude as number,
              lon: i.longitude as number,
              severity: i.severity,
            }))
        );
      })
      .catch(() => { if (active) setIssuePins([]); });
    return () => { active = false; };
  }, [props.paddocks, props.farmPins]);

  return Platform.OS === "web"
    ? <WebMap {...props} issuePins={issuePins} ref={ref} />
    : <NativeMap {...props} issuePins={issuePins} ref={ref} />;
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  web: { flex: 1, backgroundColor: "#E8ECE9" },
});
