/**
 * BrandLogo - Brand mark using logo images
 * Desktop: logo-header.png (horizontal), Mobile: logo-splash.png (vertical/icon)
 */

interface BrandLogoProps {
  /** Image height in pixels (default: 40) */
  size?: number;
}

export function BrandLogo({ size = 40 }: BrandLogoProps) {
  return (
    <>
      {/* Desktop: horizontal logo */}
      <img
        src="/logo-header.png"
        alt="Hammoc"
        className="select-none hidden md:block"
        style={{ height: `${size}px`, width: 'auto' }}
        draggable={false}
      />
      {/* Mobile: splash/icon logo */}
      <img
        src="/logo-splash.png"
        alt="Hammoc"
        className="select-none md:hidden"
        style={{ height: `${size}px`, width: 'auto' }}
        draggable={false}
      />
    </>
  );
}
