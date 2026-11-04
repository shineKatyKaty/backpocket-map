import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps';
import { MarkerClusterer, type Marker } from '@googlemaps/markerclusterer';
import type { Interest, Place } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

const INTEREST_COLOR: Record<Interest, string> = {
  高: '#e4572e',
  中: '#4a6fa5',
  低: '#9aa5b1',
};

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface Props {
  places: Place[];
  selectedId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  origin: { lat: number; lng: number } | null;
  onBoundsChange?: (b: MapBounds) => void;
}

function Markers({
  places,
  selectedId,
  hoverId,
  onSelect,
}: Pick<Props, 'places' | 'selectedId' | 'hoverId' | 'onSelect'>) {
  const map = useMap();
  const [markers, setMarkers] = useState<Record<string, Marker>>({});
  const clusterer = useMemo(() => (map ? new MarkerClusterer({ map }) : null), [map]);

  useEffect(() => {
    if (!clusterer) return;
    clusterer.clearMarkers();
    clusterer.addMarkers(Object.values(markers));
  }, [clusterer, markers]);

  const setRef = useCallback((marker: Marker | null, key: string) => {
    setMarkers((prev) => {
      if ((marker && prev[key]) || (!marker && !prev[key])) return prev;
      const next = { ...prev };
      if (marker) next[key] = marker;
      else delete next[key];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!map || !selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (p && p.lat != null && p.lng != null) map.panTo({ lat: p.lat, lng: p.lng });
  }, [map, selectedId, places]);

  return (
    <>
      {places
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => {
          const active = p.id === selectedId || p.id === hoverId;
          const base = p.interest === '高' ? 1.3 : 1.0;
          return (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.lat!, lng: p.lng! }}
              ref={(m) => setRef(m, p.id)}
              onClick={() => onSelect(p.id)}
              zIndex={active ? 10 : undefined}
              title={p.name}
            >
              <Pin
                background={INTEREST_COLOR[p.interest]}
                borderColor="#ffffff"
                glyphColor="#ffffff"
                scale={active ? base * 1.25 : base}
              />
            </AdvancedMarker>
          );
        })}
    </>
  );
}

export default function MapView({ places, selectedId, hoverId, onSelect, origin, onBoundsChange }: Props) {
  if (!API_KEY) {
    return (
      <div className="map-placeholder">
        <p>
          地図を表示するには <code>frontend/.env.local</code> に
          <br />
          <code>VITE_GOOGLE_MAPS_API_KEY</code> を設定してください。
        </p>
        <p className="muted">キー未設定でも、リスト・検索・条件フィルタはそのまま使えます。</p>
      </div>
    );
  }
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={origin ?? { lat: 35.3, lng: 137.0 }}
        defaultZoom={origin ? 12 : 6}
        mapId={MAP_ID}
        gestureHandling="greedy"
        clickableIcons={false}
        disableDefaultUI={false}
        style={{ width: '100%', height: '100%' }}
        onBoundsChanged={(ev) => onBoundsChange?.(ev.detail.bounds)}
      >
        <Markers places={places} selectedId={selectedId} hoverId={hoverId} onSelect={onSelect} />
        {origin && (
          <AdvancedMarker position={origin} title="現在地">
            <div className="here-dot" />
          </AdvancedMarker>
        )}
      </Map>
    </APIProvider>
  );
}
