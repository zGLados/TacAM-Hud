import { useEffect, useState } from 'react';
import { useHud } from '../state/store';
import { defaultBrandLogo, defaultSponsors } from '../lib/assets';

const uploadUrl = (file: string | null) => (file ? `/uploads/${encodeURIComponent(file)}` : null);

/** Rotating sponsor logos plus the static brand logo (top right). */
export function Sponsors() {
  const theme = useHud((s) => s.theme);
  const visible = useHud((s) => s.config.visibility.sponsors);
  const logos = theme.sponsors.length ? theme.sponsors.map((s) => uploadUrl(s.file)!) : defaultSponsors;
  const brand = uploadUrl(theme.brandLogo) ?? defaultBrandLogo;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (logos.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % logos.length), theme.sponsorInterval * 1000);
    return () => clearInterval(timer);
  }, [logos.length, theme.sponsorInterval]);

  return (
    <div className={`sponsors ${theme.showSponsors && visible ? '' : 'is-hidden'}`}>
      <div className="sponsors__rotation">
        {logos.map((logo, i) => (
          <img key={logo} src={logo} alt={`Sponsor ${i + 1}`} className={i === index % logos.length ? 'is-active' : ''} />
        ))}
      </div>
      <div className="sponsors__brand">
        <img src={brand} alt="Brand" />
      </div>
    </div>
  );
}
