import { useEffect, useState } from 'react';
import { useHud } from '../state/store';

const uploadUrl = (file: string) => `/uploads/${encodeURIComponent(file)}`;

/** Random index different from `current` (when there is a choice). */
function nextIndex(count: number, current: number | null) {
  if (count <= 1) return 0;
  let next = Math.floor(Math.random() * count);
  while (next === current) next = Math.floor(Math.random() * count);
  return next;
}

/**
 * Plays the uploaded background videos in random order behind a scene.
 * Muted, because autoplay with sound is blocked and OBS mixes audio separately.
 */
export function BackgroundVideo() {
  const videos = useHud((s) => s.theme.backgroundVideos);
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    setIndex(videos.length ? nextIndex(videos.length, null) : null);
  }, [videos]);

  if (index === null || !videos[index]) return null;
  return (
    <video
      className="scene__video"
      key={videos[index].id}
      src={uploadUrl(videos[index].file)}
      autoPlay
      muted
      playsInline
      loop={videos.length === 1}
      onEnded={() => setIndex((i) => nextIndex(videos.length, i))}
      // Skip broken files instead of showing a frozen frame.
      onError={() => videos.length > 1 && setIndex((i) => nextIndex(videos.length, i))}
    />
  );
}
