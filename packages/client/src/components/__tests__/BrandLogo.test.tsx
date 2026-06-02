/**
 * BrandLogo Tests
 *
 * Verifies the brand logo button navigates to the project list root from any
 * page where the header is mounted (chat header, project tab header, project
 * list header).
 */

// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BrandLogo } from '../BrandLogo';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('BrandLogo', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  const renderLogo = () =>
    render(
      <MemoryRouter initialEntries={['/project/some-slug/sessions']}>
        <BrandLogo />
      </MemoryRouter>
    );

  it('renders as an accessible button', () => {
    renderLogo();
    const button = screen.getByTestId('brand-logo');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('aria-label');
  });

  it('navigates to the project list root when clicked', () => {
    renderLogo();
    fireEvent.click(screen.getByTestId('brand-logo'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('exposes both desktop and mobile logo images', () => {
    renderLogo();
    const imgs = screen.getAllByAltText('Hammoc');
    expect(imgs.length).toBe(2);
  });
});
