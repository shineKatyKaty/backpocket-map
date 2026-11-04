import { useEffect, useState, type CSSProperties } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { Interest, Place } from '../types';
import { BIG_CATEGORY_COLOR, colorForTags, type Vocabulary } from '../vocab';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

/** 名前ラベルを常時出すズーム閾値（これ未満は選択/ホバー時のみ） */
const LABEL_ZOOM = 14;

/** 興味度 → ピンの大きさ */
const INTEREST_SCALE: Record<Interest, number> = { 高: 1.25, 中: 1.0, 低: 0.82 };

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface Props {
  places: Place[];
  vocab: Vocabulary;
  selectedId: string | null;
  hoverId: string | null;
  onSelect: (id: string) => void;
  origin: { lat: number; lng: number } | null;
  onBoundsChange?: (b: MapBounds) => void;
}

/** 個別ピン（クラスタなし） */
function Markers({
  places,
  vocab,
  selectedId,
  hoverId,
  onSelect,
}: Pick<Props, 'places' | 'vocab' | 'selectedId' | 'hoverId' | 'onSelect'>) {
  const map = useMap();
  const [zoom, setZoom] = useState<number>(6);

  // ズーム追従（ラベル表示の判定に使う）
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom() ?? 6);
    update();
    const l = map.addListener('zoom_changed', update);
    return () => l.remove();
  }, [map]);

  // 選択された場所へパン
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
          const color = colorForTags(vocab, p.tags);
          const scale = INTEREST_SCALE[p.interest] ?? 1;
          const showLabel = zoom >= LABEL_ZOOM || active;
          return (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.lat!, lng: p.lng! }}
              onClick={() => onSelect(p.id)}
              zIndex={active ? 10 : undefined}
              title={p.name}
            >
              <div
                className={`pin-wrap ${active ? 'is-active' : ''}`}
                style={{ '--pin': color, '--s': String(scale) } as CSSProperties}
              >
                {showLabel && <div className="pin-label">{p.name}</div>}
                <div className="pin-dot" />
              </div>
            </AdvancedMarker>
          );
        })}
    </>
  );
}

function Legend({ vocab }: { vocab: Vocabulary }) {
  const bigs = vocab.bigs.filter((b) => BIG_CATEGORY_COLOR[b]);
  return (
    <div className="map-legend">
      {bigs.map((b) => (
        <span key={b} className="legend-item">
          <span className="legend-dot" style={{ background: BIG_CATEGORY_COLOR[b] }} />
          {b}
        </span>
      ))}
    </div>
  );
}

export default function MapView({
  places,
  vocab,
  selectedId,
  hoverId,
  onSelect,
  origin,
  onBoundsChange,
}: Props) {
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
    <div className="map-wrap">
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
          <Markers
            places={places}
            vocab={vocab}
            selectedId={selectedId}
            hoverId={hoverId}
            onSelect={onSelect}
          />
          {origin && (
            <AdvancedMarker position={origin} title="現在地">
              <div className="here-dot" />
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>
      <Legend vocab={vocab} />
    </div>
  );
}
