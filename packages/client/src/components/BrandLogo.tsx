/**
 * BrandLogo - Brand mark using logo images
 * Desktop: logo-header.png (horizontal), Mobile: logo-splash.png (vertical/icon)
 *
 * Clickable: navigates to project list (/) from any page.
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface BrandLogoProps {
  /** Image height in pixels (default: 40) */
  size?: number;
}

export function BrandLogo({ size = 40 }: BrandLogoProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      aria-label={t('layout.goToProjectList')}
      data-testid="brand-logo"
      className="flex items-center self-center rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
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
    </button>
  );
}
