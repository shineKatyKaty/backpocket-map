import type { Place } from '../types';

interface Props {
  place: Place | null;
  onClose: () => void;
}

function formatSaved(sec: number | null): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleDateString('ja-JP');
}

export default function DetailSheet({ place, onClose }: Props) {
  if (!place) return null;
  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>{place.name}</h2>
          <button className="clear-btn" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="detail-badges">
          <span className={`dot interest-${place.interest}`} aria-hidden />
          <span>興味度 {place.interest}</span>
          {place.visited && <span className="badge visited">訪問済</span>}
          {place.needs_review && <span className="badge review">座標要確認</span>}
        </div>

        {place.tags.length > 0 && (
          <div className="detail-tags">
            {place.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}

        <dl className="detail-list">
          {place.duration != null && (
            <>
              <dt>滞在目安</dt>
              <dd>{place.duration} 分</dd>
            </>
          )}
          {place.address && (
            <>
              <dt>住所</dt>
              <dd>{place.address}</dd>
            </>
          )}
          {place.note && (
            <>
              <dt>メモ</dt>
              <dd className="pre">{place.note}</dd>
            </>
          )}
          {place.lists.length > 0 && (
            <>
              <dt>リスト</dt>
              <dd>{place.lists.join('、')}</dd>
            </>
          )}
          {place.saved_at && (
            <>
              <dt>保存日</dt>
              <dd>{formatSaved(place.saved_at)}</dd>
            </>
          )}
        </dl>

        {place.gmaps_url && (
          <a className="gmaps-btn" href={place.gmaps_url} target="_blank" rel="noreferrer">
            Googleマップで開く
          </a>
        )}
      </div>
    </div>
  );
}
