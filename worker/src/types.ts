/** Cloudflare Worker の環境バインディング */
export interface Env {
  DB: D1Database;
  /** ショートカット同期の共有シークレット（secret / .dev.vars） */
  SYNC_SECRET: string;
  /** CORS 許可オリジン。Pages のURL。開発は http://localhost:5173 */
  ALLOW_ORIGIN: string;
  /** Gemini API キー（タグ自動生成）。未設定ならタグ生成はスキップ */
  GEMINI_API_KEY?: string;
  /** Gemini モデル名（任意）。既定 gemini-2.0-flash-lite */
  GEMINI_MODEL?: string;
  /** Google Routes API キー（移動時間）。未設定なら /routes は 503 */
  ROUTES_API_KEY?: string;
}

/** パーサが生データから取り出す1件分 */
export interface ParsedPlace {
  id: string; // CID "数値:数値"
  cidNumber: string | null; // CID 後半（?cid= 用）
  name: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  placeId: string | null;
  savedAt: number | null; // UNIX秒
  gmapsUrl: string;
  needsReview: boolean;
}

/** フロントエンドへ返す場所DTO（GET /places） */
export interface PlaceDTO {
  id: string;
  name: string;
  name_kana: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  note: string | null;
  gmaps_url: string | null;
  place_id: string | null;
  duration: number | null; // manual 優先・無ければ auto
  interest: '高' | '中' | '低';
  visited: boolean;
  needs_review: boolean;
  saved_at: number | null;
  lists: string[];
  tags: string[];
}
