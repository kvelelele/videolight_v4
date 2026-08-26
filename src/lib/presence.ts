import type { DetectionTrack } from './detections';

const PRESENCE_CLASSES = new Set(['person', 'car']);

export function tracksIndicatePresence(tracks: DetectionTrack[]): { present: boolean; classes: string[] } {
  const classes = [...new Set(tracks.map((t) => t.class).filter((c) => PRESENCE_CLASSES.has(c)))];
  return { present: classes.length > 0, classes };
}
