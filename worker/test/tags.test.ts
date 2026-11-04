import { describe, it, expect } from 'vitest';
import {
  durationFor,
  buildTagPrompt,
  parseGeminiTags,
  sanitizeAssignment,
  type Vocabulary,
} from '../src/tags';

const vocab: Vocabulary = {
  bigs: ['飲食', '見学', 'その他'],
  smallsByBig: { 飲食: ['ラーメン', '喫茶店', 'カフェ'], 見学: ['美術館', '建築'], その他: [] },
  smallId: { ラーメン: 1, 喫茶店: 2, カフェ: 3, 美術館: 4, 建築: 5 },
  bigId: { 飲食: 10, 見学: 11, その他: 12 },
};

describe('durationFor', () => {
  it('小カテゴリ優先（ラーメン=30）', () => {
    expect(durationFor('飲食', ['ラーメン'])).toBe(30);
  });
  it('大カテゴリ既定（飲食=60, 見学=90）', () => {
    expect(durationFor('飲食', ['喫茶店'])).toBe(60);
    expect(durationFor('見学', ['美術館'])).toBe(90);
  });
  it('その他は未設定(null)', () => {
    expect(durationFor('その他', [])).toBeNull();
    expect(durationFor(null, [])).toBeNull();
  });
});

describe('buildTagPrompt', () => {
  it('語彙と場所を含む', () => {
    const p = buildTagPrompt(vocab, [{ id: '1:2', name: 'テスト喫茶', note: '静か' }]);
    expect(p).toContain('飲食');
    expect(p).toContain('ラーメン');
    expect(p).toContain('テスト喫茶');
    expect(p).toContain('id=1:2');
  });
});

describe('parseGeminiTags', () => {
  it('素のJSON配列を解釈', () => {
    const r = parseGeminiTags('[{"id":"1:2","big":"飲食","smalls":["喫茶店"]}]');
    expect(r.get('1:2')).toEqual({ big: '飲食', smalls: ['喫茶店'] });
  });
  it('```json フェンス付きでも解釈', () => {
    const r = parseGeminiTags('```json\n[{"id":"a","big":"見学","smalls":[]}]\n```');
    expect(r.get('a')?.big).toBe('見学');
  });
  it('壊れた出力は空', () => {
    expect(parseGeminiTags('すみません、わかりません').size).toBe(0);
  });
});

describe('sanitizeAssignment', () => {
  it('語彙外の大/小を除去し小は大に属するものだけ残す', () => {
    const a = sanitizeAssignment(vocab, { big: '飲食', smalls: ['喫茶店', '美術館', '存在しない'] });
    expect(a).toEqual({ big: '飲食', smalls: ['喫茶店'] });
  });
  it('語彙外の大は null', () => {
    expect(sanitizeAssignment(vocab, { big: 'でたらめ', smalls: ['喫茶店'] })).toEqual({
      big: null,
      smalls: [],
    });
  });
});
