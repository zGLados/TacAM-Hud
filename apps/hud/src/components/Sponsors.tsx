import { useEffect, useState } from 'react';
import { useHud } from '../state/store';

const uploadUrl = (file: string) => `/uploads/${encodeURIComponent(file)}`;

/**
 * Top right corner: rotating sponsor logos and the brand logo. Both are managed
 * in the theme editor and can be hidden independently.
 */
export function Sponsors() {
  const theme = useHud((s) => s.theme);
  const visible = useHud((s) => s.config.visibility.sponsors);
  const logos = theme.sponsors.map((s) => uploadUrl(s.file));
  const showRotation = visible && theme.showSponsors && logos.length > 0;
  const showBrand = theme.showBrandLogo && !!theme.brandLogo;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (logos.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % logos.length), theme.sponsorInterval * 1000);
    return () => clearInterval(timer);
  }, [logos.length, theme.sponsorInterval]);

  return (
    <div className={`sponsors ${showRotation || showBrand ? '' : 'is-hidden'}`}>
      {showRotation && (
        <div className="sponsors__rotation">
          {logos.map((logo, i) => (
            <img key={logo} src={logo} alt={`Sponsor ${i + 1}`} className={i === index % logos.length ? 'is-active' : ''} />
          ))}
        </div>
      )}
      {showBrand && (
        <div className={`sponsors__brand ${theme.brandLogoGrayscale ? 'is-grayscale' : ''}`}>
          <img src={uploadUrl(theme.brandLogo!)} alt="Brand" />
        </div>
      )}
    </div>
  );
}
