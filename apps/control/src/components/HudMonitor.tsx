import { useEffect, useRef, useState, type Ref } from 'react';

interface Props {
  /** HUD URL, e.g. `/hud/` or `/hud/?scene=brb`. */
  src: string;
  title: string;
  iframeRef?: Ref<HTMLIFrameElement>;
  onLoad?: () => void;
}

/** The 1920×1080 HUD in an iframe, scaled down to the container width. */
export function HudMonitor({ src, title, iframeRef, onLoad }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1920));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="hud_preview" ref={box}>
      <iframe ref={iframeRef} src={src} title={title} style={{ transform: `scale(${scale})` }} onLoad={onLoad} />
    </div>
  );
}
