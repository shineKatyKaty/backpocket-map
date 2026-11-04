export type Interest = '高' | '中' | '低';

/** Worker の GET /places が返す形（= サンプルデータの形） */
export interface Place {
  id: string;
  name: string;
  name_kana: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  note: string | null;
  gmaps_url: string | null;
  place_id: string | null;
  duration: number | null; // 分（manual 優先済み）
  interest: Interest;
  visited: boolean;
  needs_review: boolean;
  saved_at: number | null; // UNIX秒
  lists: string[];
  tags: string[];
}

export type DataSource = 'api' | 'sample';
