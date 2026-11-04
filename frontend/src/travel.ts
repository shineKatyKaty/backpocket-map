export type TravelMode = 'WALK' | 'TRANSIT' | 'DRIVE';

export const TRAVEL_MODES: { key: TravelMode; label: string }[] = [
  { key: 'WALK', label: '徒歩' },
  { key: 'TRANSIT', label: '公共交通' },
  { key: 'DRIVE', label: '車' },
];
