/**
 * ConnectionStatusIndicator Tests
 * [Source: Story 1.4, Story 4.7 - Task 6]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionStatusIndicator } from '../ConnectionStatusIndicator';

describe('ConnectionStatusIndicator', () => {
  const defaultProps = {
    status: 'disconnected' as const,
    reconnectAttempt: 0,
    lastError: null,
    onReconnect: vi.fn(),
  };

  describe('connected status', () => {
    it('should display connected icon and text', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
        />
      );

      expect(screen.getByText('연결됨')).toBeInTheDocument();
    });

    it('should have correct aria-label for connected status', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-label', 'WebSocket 연결 상태: 연결됨');
    });
  });

  describe('disconnected status', () => {
    it('should display disconnected icon and text', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
        />
      );

      expect(screen.getByText('연결 끊김')).toBeInTheDocument();
    });

    it('should have correct aria-label for disconnected status', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-label', 'WebSocket 연결 상태: 연결 끊김');
    });

    it('should show reconnect button when there is an error', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError="Connection failed"
        />
      );

      expect(screen.getByRole('button', { name: /서버에 다시 연결 시도/i })).toBeInTheDocument();
    });

    it('should not show reconnect button when there is no error', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError={null}
        />
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should call onReconnect when reconnect button is clicked', () => {
      const onReconnect = vi.fn();
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError="Connection failed"
          onReconnect={onReconnect}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /서버에 다시 연결 시도/i }));
      expect(onReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconnecting status', () => {
    it('should display reconnecting icon and text with attempt count', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="reconnecting"
          reconnectAttempt={3}
        />
      );

      expect(screen.getByText('재연결 중 (3/5)')).toBeInTheDocument();
    });

    it('should have correct aria-label with attempt count', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="reconnecting"
          reconnectAttempt={2}
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute(
        'aria-label',
        'WebSocket 연결 상태: 재연결 중 2번째 시도'
      );
    });
  });

  describe('accessibility', () => {
    it('should have role="status"', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
        />
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have aria-live="polite"', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
    });

    it('should have title attribute with error message when present', () => {
      const errorMessage = 'Connection timeout';
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError={errorMessage}
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('title', errorMessage);
    });

    it('should have aria-label on reconnect button', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError="Error"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', '서버에 다시 연결 시도');
    });
  });

  // Story 4.7 - Task 6: Extended tests for compact mode and Lucide icons
  describe('compact mode', () => {
    it('should render in compact mode with only icon visible', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
          compact
        />
      );

      // In compact mode, text should not be directly visible
      expect(screen.queryByText('연결됨')).not.toBeInTheDocument();
      // But testid should be present
      expect(screen.getByTestId('connection-status-indicator')).toBeInTheDocument();
    });

    it('should have tooltip content via title attribute in compact mode', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
          compact
        />
      );

      const statusElement = screen.getByTestId('connection-status-indicator');
      expect(statusElement).toHaveAttribute('title', '연결됨');
    });

    it('should show error message in tooltip when lastError is present in compact mode', () => {
      const errorMessage = 'Connection timeout';
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError={errorMessage}
          compact
        />
      );

      const statusElement = screen.getByTestId('connection-status-indicator');
      expect(statusElement).toHaveAttribute('title', errorMessage);
    });

    it('should have background color applied in compact mode', () => {
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
          compact
        />
      );

      const statusElement = screen.getByTestId('connection-status-indicator');
      expect(statusElement.className).toContain('bg-green-100');
    });

    it('should show reconnect button in compact mode when disconnected with error', () => {
      const onReconnect = vi.fn();
      render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
          lastError="Error"
          onReconnect={onReconnect}
          compact
        />
      );

      const reconnectButton = screen.getByRole('button', { name: /서버에 다시 연결 시도/i });
      expect(reconnectButton).toBeInTheDocument();

      fireEvent.click(reconnectButton);
      expect(onReconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lucide icons', () => {
    it('should render Wifi icon for connected status', () => {
      const { container } = render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
        />
      );

      // Lucide icons render as SVG elements - use getAttribute for SVG class
      const svgIcon = container.querySelector('svg');
      expect(svgIcon).toBeInTheDocument();
      expect(svgIcon?.getAttribute('class')).toContain('text-green-500');
    });

    it('should render WifiOff icon for disconnected status', () => {
      const { container } = render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
        />
      );

      const svgIcon = container.querySelector('svg');
      expect(svgIcon).toBeInTheDocument();
      expect(svgIcon?.getAttribute('class')).toContain('text-red-500');
    });

    it('should render RefreshCw icon for reconnecting status', () => {
      const { container } = render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="reconnecting"
          reconnectAttempt={1}
        />
      );

      const svgIcon = container.querySelector('svg');
      expect(svgIcon).toBeInTheDocument();
      expect(svgIcon?.getAttribute('class')).toContain('text-yellow-500');
    });
  });

  describe('animation', () => {
    it('should apply animate-spin class to icon when reconnecting', () => {
      const { container } = render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="reconnecting"
          reconnectAttempt={1}
        />
      );

      const svgIcon = container.querySelector('svg');
      expect(svgIcon?.getAttribute('class')).toContain('animate-spin');
    });

    it('should not apply animate-spin class when connected', () => {
      const { container } = render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="connected"
        />
      );

      const svgIcon = container.querySelector('svg');
      expect(svgIcon?.getAttribute('class')).not.toContain('animate-spin');
    });

    it('should not apply animate-spin class when disconnected', () => {
      const { container } = render(
        <ConnectionStatusIndicator
          {...defaultProps}
          status="disconnected"
        />
      );

      const svgIcon = container.querySelector('svg');
      expect(svgIcon?.getAttribute('class')).not.toContain('animate-spin');
    });
  });
});
