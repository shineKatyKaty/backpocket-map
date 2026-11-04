/**
 * Cloudflare Pages Function（同一オリジンAPIプロキシ）。
 * ブラウザは backpocket-map.pages.dev/api/... だけを叩き、ここが Worker へ中継する。
 *  - この関数は Pages 側の Cloudflare Access に守られる（＝ログイン必須）
 *  - 中継時にサーバ側だけが持つ APP_SECRET を付与 → Worker は素の読み書きを拒否できる
 *  - /sync は iPhone ショートカットが Worker を直接叩くので、ここでは中継しない
 *
 * 必要な環境変数（Pages → Settings → Environment variables, Production）:
 *   APP_SECRET  … Worker 側の secret と同じ値（VITE_ を付けない＝ブラウザに出さない）
 */
const WORKER = 'https://backpocket-map-api.shinshinkaty.workers.dev';

interface Env {
  APP_SECRET?: string;
}

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  // /api 以降を Worker のパスへ（エンコードはそのまま保持）
  let sub = url.pathname.replace(/^\/api/, '');
  if (!sub.startsWith('/')) sub = '/' + sub;
  if (sub === '/' ) return new Response('not found', { status: 404 });
  if (sub === '/sync') return new Response('forbidden', { status: 403 }); // /sync は中継しない

  const headers = new Headers();
  const ct = request.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  headers.set('X-App-Secret', env.APP_SECRET ?? '');

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const resp = await fetch(WORKER + sub + url.search, init);
  // Content-Type だけ引き継いで返す（CORSは同一オリジンなので不要）
  const out = new Headers();
  const rct = resp.headers.get('content-type');
  if (rct) out.set('content-type', rct);
  return new Response(resp.body, { status: resp.status, headers: out });
}
