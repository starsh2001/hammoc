/**
 * Story 30.1 (Task 4.5): ShareBadge tests.
 *
 * Confirms each variant renders the right i18n key + data-attribute so the
 * integration tests (B-14-01) can assert the correct verdict on each card.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareBadge } from '../ShareBadge';

import { vi } from 'vitest';
vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

describe('ShareBadge', () => {
  it.each(['shared', 'local', 'fullyIgnored'] as const)(
    'renders the %s variant with the matching i18n key',
    (scope) => {
      render(<ShareBadge scope={scope} />);
      const el = screen.getByTestId(`share-badge-${scope}`);
      expect(el).toHaveAttribute('data-variant', scope);
      expect(el).toHaveTextContent(`harness.tools.shareBadge.${scope}`);
    },
  );
});
