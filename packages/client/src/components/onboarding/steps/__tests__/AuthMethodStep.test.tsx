// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthMethodStep } from '../AuthMethodStep';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

describe('AuthMethodStep', () => {
  const onSelectClaude = vi.fn();
  const onSelectApiKey = vi.fn();

  it('renders heading and two method cards', () => {
    render(<AuthMethodStep onSelectClaude={onSelectClaude} onSelectApiKey={onSelectApiKey} />);
    expect(screen.getByText('wizard.authMethod.title')).toBeInTheDocument();
    expect(screen.getByText('wizard.authMethod.claude.label')).toBeInTheDocument();
    expect(screen.getByText('wizard.authMethod.apiKey.label')).toBeInTheDocument();
  });

  it('calls onSelectClaude when Claude card is clicked', () => {
    render(<AuthMethodStep onSelectClaude={onSelectClaude} onSelectApiKey={onSelectApiKey} />);
    fireEvent.click(screen.getByText('wizard.authMethod.claude.label'));
    expect(onSelectClaude).toHaveBeenCalled();
  });

  it('calls onSelectApiKey when API key card is clicked', () => {
    render(<AuthMethodStep onSelectClaude={onSelectClaude} onSelectApiKey={onSelectApiKey} />);
    fireEvent.click(screen.getByText('wizard.authMethod.apiKey.label'));
    expect(onSelectApiKey).toHaveBeenCalled();
  });
});
