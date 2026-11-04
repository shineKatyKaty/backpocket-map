import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * 地図(Google Maps/マーカー)の例外でアプリ全体が白画面になるのを防ぐ。
 * 例: APIキーのリファラ不許可(RefererNotAllowedMapError)でマーカーが落ちるケース。
 */
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    // 握りつぶす（リスト・検索は動かし続ける）。デバッグ用にログだけ残す。
    console.error('MapErrorBoundary:', err);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
