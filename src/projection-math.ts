export type FitMode = 'contain' | 'cover';

/** UV scale: values greater than one become letterbox regions in contain mode. */
export function fitScale(mediaAspect: number, screenAspect: number, fit: FitMode): [number, number] {
  const ratio = mediaAspect / screenAspect;
  if (!Number.isFinite(ratio) || ratio <= 0) return [1, 1];
  return fit === 'contain'
    ? (ratio > 1 ? [1, ratio] : [1 / ratio, 1])
    : (ratio > 1 ? [1 / ratio, 1] : [1, ratio]);
}

/** Maintain the full image's physical coordinates while the lower curtain edge rises. */
export function curtainUv(v: number, deployment: number): number {
  return 1 - deployment + v * deployment;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
