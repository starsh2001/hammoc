// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisplayNameStep } from '../DisplayNameStep';
import { usePreferencesStore } from '../../../../stores/preferencesStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

describe('DisplayNameStep', () => {
  const onNext = vi.fn();
  const onSkip = vi.fn();
  const updatePreferences = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      updatePreferences,
      preferences: {},
      loaded: true,
    });
  });

  it('renders heading, input, next and skip buttons', () => {
    render(<DisplayNameStep onNext={onNext} onSkip={onSkip} />);
    expect(screen.getByText('wizard.displayName.title')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wizard.next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wizard.skip' })).toBeInTheDocument();
  });

  it('saves displayName and advances on next', () => {
    render(<DisplayNameStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'wizard.next' }));
    expect(updatePreferences).toHaveBeenCalledWith({ displayName: 'Alice' });
    expect(onNext).toHaveBeenCalled();
  });

  it('advances without saving when name is empty', () => {
    render(<DisplayNameStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: 'wizard.next' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  it('calls onSkip when skip button is clicked', () => {
    render(<DisplayNameStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: 'wizard.skip' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('advances on Enter key', () => {
    render(<DisplayNameStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bob' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(updatePreferences).toHaveBeenCalledWith({ displayName: 'Bob' });
    expect(onNext).toHaveBeenCalled();
  });
});
