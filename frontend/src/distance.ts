export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** 2点間の直線距離(km)。端末内で即時計算（設計書「移動時間の表示」） */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(km < 10 ? 1 : 0)}km`;
}

/** 秒 → 「1時間20分」/「35分」 */
export function formatTravel(sec: number): string {
  const m = Math.round(sec / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}時間${r}分` : `${h}時間`;
  }
  return `${m}分`;
}
