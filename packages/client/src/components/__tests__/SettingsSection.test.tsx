/**
 * SettingsSection Tests
 * [Source: Story 10.1 - Task 7]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { SettingsSection } from '../SettingsSection';

describe('SettingsSection', () => {
  // TC-SS1: Section title and icon render
  it('renders section title and icon', () => {
    render(
      <SettingsSection title="전역 설정" icon={Settings}>
        <span>Content</span>
      </SettingsSection>
    );
    expect(screen.getByText('전역 설정')).toBeInTheDocument();
  });

  // TC-SS2: Children content renders
  it('renders children content', () => {
    render(
      <SettingsSection title="전역 설정" icon={Settings}>
        <span>Test Content</span>
      </SettingsSection>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  // TC-SS3: Children hidden when isExpanded=false
  it('hides children when isExpanded is false', () => {
    render(
      <SettingsSection
        title="전역 설정"
        icon={Settings}
        isExpanded={false}
        onToggle={() => {}}
      >
        <span>Hidden Content</span>
      </SettingsSection>
    );
    expect(screen.queryByText('Hidden Content')).not.toBeInTheDocument();
  });

  // TC-SS4: onToggle callback called on click
  it('calls onToggle callback when header is clicked', () => {
    const mockToggle = vi.fn();
    render(
      <SettingsSection
        title="전역 설정"
        icon={Settings}
        isExpanded={false}
        onToggle={mockToggle}
      >
        <span>Content</span>
      </SettingsSection>
    );

    const toggleButton = screen.getByRole('button');
    fireEvent.click(toggleButton);
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  // TC-SS5: Dark mode styles applied
  it('applies dark mode styles', () => {
    render(
      <SettingsSection title="전역 설정" icon={Settings}>
        <span>Content</span>
      </SettingsSection>
    );
    const titleSpan = screen.getByText('전역 설정');
    expect(titleSpan.className).toContain('dark:text-white');
  });
});
