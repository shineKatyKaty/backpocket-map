import { useEffect, useState } from 'react';
import type { Interest, Place } from '../types';
import type { PlacePatch, TravelResult } from '../api';
import type { Vocabulary } from '../vocab';
import { formatKm, formatTravel } from '../distance';

interface Props {
  place: Place | null;
  distanceKm: number | null;
  travel: TravelResult | undefined;
  travelLabel: string;
  vocab: Vocabulary;
  onClose: () => void;
  onPatch: (id: string, patch: PlacePatch) => void;
  onAddTag: (id: string, name: string) => void;
  onRemoveTag: (id: string, name: string) => void;
}

const INTERESTS: Interest[] = ['高', '中', '低'];

function formatSaved(sec: number | null): string {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleDateString('ja-JP');
}

export default function DetailSheet({
  place,
  distanceKm,
  travel,
  travelLabel,
  vocab,
  onClose,
  onPatch,
  onAddTag,
  onRemoveTag,
}: Props) {
  const [durText, setDurText] = useState('');
  const [tagText, setTagText] = useState('');

  useEffect(() => {
    setDurText(place?.duration != null ? String(place.duration) : '');
    setTagText('');
  }, [place?.id, place?.duration]);

  if (!place) return null;

  const commitDuration = () => {
    const t = durText.trim();
    const v = t === '' ? null : Number(t);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return;
    onPatch(place.id, { duration_manual: v });
  };

  const addTag = () => {
    const name = tagText.trim();
    if (!name) return;
    if (!place.tags.includes(name)) onAddTag(place.id, name);
    setTagText('');
  };

  const suggestions = vocab.bigs.flatMap((b) => vocab.smallsByBig[b] ?? []);

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <h2>{place.name}</h2>
          <button className="clear-btn" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {/* 興味度（その場で変更） */}
        <div className="edit-row">
          <span className="edit-label">興味度</span>
          <div className="seg">
            {INTERESTS.map((v) => (
              <button
                key={v}
                className={`seg-btn ${place.interest === v ? 'on' : ''} interest-text-${v}`}
                onClick={() => onPatch(place.id, { interest: v })}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* 訪問済み */}
        <div className="edit-row">
          <span className="edit-label">訪問</span>
          <button
            className={`chip ${place.visited ? 'on' : ''}`}
            onClick={() => onPatch(place.id, { visited: !place.visited })}
          >
            {place.visited ? '訪問済' : '未訪問'}
          </button>
        </div>

        {/* 滞在の所要時間（手動） */}
        <div className="edit-row">
          <span className="edit-label">滞在目安</span>
          <input
            className="dur-input"
            type="number"
            inputMode="numeric"
            min={0}
            value={durText}
            placeholder="分"
            onChange={(e) => setDurText(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
          />
          <span className="unit">分</span>
        </div>

        {/* タグ（付け外し） */}
        <div className="edit-row tags-row">
          <span className="edit-label">タグ</span>
          <div className="tag-edit">
            <div className="detail-tags">
              {place.tags.map((t) => (
                <span key={t} className="tag removable">
                  {t}
                  <button className="tag-x" onClick={() => onRemoveTag(place.id, t)} aria-label={`${t}を外す`}>
                    ×
                  </button>
                </span>
              ))}
              {place.tags.length === 0 && <span className="muted">なし</span>}
            </div>
            <div className="tag-add">
              <input
                className="tag-input"
                list="tag-suggestions"
                value={tagText}
                placeholder="タグを追加"
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
              <datalist id="tag-suggestions">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button className="chip" onClick={addTag}>
                追加
              </button>
            </div>
          </div>
        </div>

        <dl className="detail-list">
          {distanceKm != null && (
            <>
              <dt>現在地から</dt>
              <dd>
                直線 {formatKm(distanceKm)}
                {travel?.durationSec != null && `・${travelLabel} ${formatTravel(travel.durationSec)}`}
              </dd>
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
