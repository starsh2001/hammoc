/**
 * MessageArea Interactive Integration Tests
 * Verifies permission onApprove/onReject → WebSocket permission:respond integration
 * [Source: Story 7.1 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageArea } from '../MessageArea';
import { useChatStore } from '../../stores/chatStore';
import type { StreamingSegment } from '../../stores/chatStore';

const mockSocketEmit = vi.fn();
vi.mock('../../services/socket', () => ({
  getSocket: () => ({
    emit: mockSocketEmit,
    connected: true,
  }),
  joinProjectRoom: vi.fn(),
  leaveProjectRoom: vi.fn(),
  rejoinProjectRooms: vi.fn(),
  forceReconnect: vi.fn(),
  disconnectSocket: vi.fn(),
}));

// Mock ResizeObserver which is not supported in jsdom
vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})));

describe('MessageArea permission WebSocket integration (Story 7.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupEditPermission() {
    const segments: StreamingSegment[] = [
      {
        type: 'tool',
        toolCall: {
          id: 'tool-edit-1',
          name: 'Edit',
          input: { file_path: '/src/test.ts', old_string: 'foo', new_string: 'bar' },
        },
        status: 'pending',
      },
      {
        type: 'interactive',
        id: 'tool-edit-1',
        interactionType: 'permission',
        choices: [
          { label: '승인', value: 'approve' },
          { label: '거절', value: 'reject' },
        ],
        status: 'waiting',
      },
    ];

    useChatStore.setState({
      isStreaming: true,
      streamingSessionId: 'test-session',
      streamingSegments: segments,
    });

    return segments;
  }

  it('should emit permission:respond with approved=true when approve is clicked', () => {
    const segments = setupEditPermission();

    render(
      <MessageArea streamingSegments={segments} isStreaming={true}>
        {null}
      </MessageArea>
    );

    const approveBtn = screen.getByLabelText('승인');
    fireEvent.click(approveBtn);

    expect(mockSocketEmit).toHaveBeenCalledWith('permission:respond', expect.objectContaining({
      requestId: 'tool-edit-1',
      approved: true,
      interactionType: 'permission',
    }));
  });

  it('should emit permission:respond with approved=false when reject is clicked', () => {
    const segments = setupEditPermission();

    render(
      <MessageArea streamingSegments={segments} isStreaming={true}>
        {null}
      </MessageArea>
    );

    const rejectBtn = screen.getByLabelText('거절');
    fireEvent.click(rejectBtn);

    expect(mockSocketEmit).toHaveBeenCalledWith('permission:respond', expect.objectContaining({
      requestId: 'tool-edit-1',
      approved: false,
      interactionType: 'permission',
    }));
  });

  it('should emit permission:respond for Write tool approve', () => {
    const segments: StreamingSegment[] = [
      {
        type: 'tool',
        toolCall: {
          id: 'tool-write-1',
          name: 'Write',
          input: { file_path: '/src/new.ts', content: 'const x = 1;' },
        },
        status: 'pending',
      },
      {
        type: 'interactive',
        id: 'tool-write-1',
        interactionType: 'permission',
        choices: [
          { label: '승인', value: 'approve' },
          { label: '거절', value: 'reject' },
        ],
        status: 'waiting',
      },
    ];

    useChatStore.setState({
      isStreaming: true,
      streamingSessionId: 'test-session',
      streamingSegments: segments,
    });

    render(
      <MessageArea streamingSegments={segments} isStreaming={true}>
        {null}
      </MessageArea>
    );

    const approveBtn = screen.getByLabelText('승인');
    fireEvent.click(approveBtn);

    expect(mockSocketEmit).toHaveBeenCalledWith('permission:respond', expect.objectContaining({
      requestId: 'tool-write-1',
      approved: true,
      interactionType: 'permission',
    }));
  });
});
