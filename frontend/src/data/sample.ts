import type { Place } from '../types';

/**
 * バックエンド未接続でもアプリが動くためのサンプルデータ。
 * VITE_API_BASE 未設定、または Worker に繋がらないときに使う。
 */
export const samplePlaces: Place[] = [
  {
    id: '1:1001', name: '喫茶マドラグ', name_kana: 'きっさまどらぐ',
    lat: 35.0116, lng: 135.7617, address: '京都府京都市中京区',
    note: '静かで作業しやすい。朝が空いてる', gmaps_url: 'https://maps.google.com/?cid=1001',
    place_id: null, duration: 60, interest: '高', visited: false, needs_review: false,
    saved_at: 1719800000, lists: ['Want to go'], tags: ['喫茶店', 'コーヒー'],
  },
  {
    id: '1:1002', name: '自家製麺 うえまち', name_kana: 'じかせいめんうえまち',
    lat: 34.6723, lng: 135.5210, address: '大阪府大阪市天王寺区',
    note: '行列覚悟。土曜昼が狙い目', gmaps_url: 'https://maps.google.com/?cid=1002',
    place_id: null, duration: 30, interest: '中', visited: true, needs_review: false,
    saved_at: 1720500000, lists: ['Want to go'], tags: ['ラーメン'],
  },
  {
    id: '1:1003', name: '東京都現代美術館', name_kana: 'とうきょうとげんだいびじゅつかん',
    lat: 35.6797, lng: 139.8172, address: '東京都江東区三好',
    note: '企画展チェック。半日みておく', gmaps_url: 'https://maps.google.com/?cid=1003',
    place_id: null, duration: 120, interest: '高', visited: false, needs_review: false,
    saved_at: 1721000000, lists: ['Want to go', '美術館'], tags: ['美術館'],
  },
  {
    id: '1:1004', name: 'SPBS 本店', name_kana: 'しぶやぱぶりっしんぐ',
    lat: 35.6646, lng: 139.6960, address: '東京都渋谷区神山町',
    note: '独立系書店。雑貨も', gmaps_url: 'https://maps.google.com/?cid=1004',
    place_id: null, duration: 45, interest: '中', visited: false, needs_review: false,
    saved_at: 1721500000, lists: ['Want to go'], tags: ['書店', '雑貨'],
  },
  {
    id: '1:1005', name: 'BOOKOFF 新宿駅西口店', name_kana: 'ぶっくおふ',
    lat: 35.6916, lng: 139.6983, address: '東京都新宿区西新宿',
    note: null, gmaps_url: 'https://maps.google.com/?cid=1005',
    place_id: null, duration: 45, interest: '低', visited: false, needs_review: false,
    saved_at: 1722000000, lists: ['Want to go'], tags: ['書店', '古着'],
  },
  {
    id: '1:1006', name: '大山崎山荘美術館', name_kana: 'おおやまざきさんそうびじゅつかん',
    lat: 34.9034, lng: 135.6836, address: '京都府乙訓郡大山崎町',
    note: '建築と庭が良い。紅葉の時期', gmaps_url: 'https://maps.google.com/?cid=1006',
    place_id: null, duration: 90, interest: '高', visited: false, needs_review: false,
    saved_at: 1722500000, lists: ['Want to go', '美術館'], tags: ['美術館', '建築'],
  },
  {
    id: '1:1007', name: '北浜レトロ', name_kana: 'きたはまれとろ',
    lat: 34.6916, lng: 135.5075, address: '大阪府大阪市中央区北浜',
    note: '英国式アフタヌーンティー', gmaps_url: 'https://maps.google.com/?cid=1007',
    place_id: null, duration: 90, interest: '中', visited: false, needs_review: true,
    saved_at: 1723000000, lists: ['Want to go'], tags: ['喫茶店', 'カフェ'],
  },
  {
    id: '1:1008', name: '金沢21世紀美術館', name_kana: 'かなざわにじゅういっせいきびじゅつかん',
    lat: 36.5611, lng: 136.6568, address: '石川県金沢市広坂',
    note: '予約必須の展示あり', gmaps_url: 'https://maps.google.com/?cid=1008',
    place_id: null, duration: 120, interest: '高', visited: false, needs_review: false,
    saved_at: 1723500000, lists: ['Want to go', '美術館'], tags: ['美術館', '建築'],
  },
];
