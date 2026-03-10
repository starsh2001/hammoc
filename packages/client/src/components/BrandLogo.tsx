/**
 * BrandLogo - Brand mark using logo-header.png image
 * Used in page headers across the app
 */

interface BrandLogoProps {
  /** Image height in pixels (default: 28) */
  size?: number;
}

export function BrandLogo({ size = 40 }: BrandLogoProps) {
  return (
    <img
      src="/logo-header.png"
      alt="Hammoc"
      className="select-none"
      style={{ height: `${size}px`, width: 'auto' }}
      draggable={false}
    />
  );
}
