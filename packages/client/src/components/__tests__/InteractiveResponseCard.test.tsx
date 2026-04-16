/**
 * InteractiveResponseCard Tests
 * [Source: Story 7.1 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InteractiveResponseCard } from '../InteractiveResponseCard';
import type { InteractiveChoice, InteractiveStatus } from '../../stores/chatStore';

describe('InteractiveResponseCard', () => {
  const permissionChoices: InteractiveChoice[] = [
    { label: '승인', value: 'approve' },
    { label: '거절', value: 'reject' },
  ];

  const questionChoices: InteractiveChoice[] = [
    { label: 'Option A', description: 'First option', value: 'Option A' },
    { label: 'Option B', description: 'Second option', value: 'Option B' },
    { label: 'Option C', value: 'Option C' },
  ];

  const defaultPermissionProps = {
    type: 'permission' as const,
    toolName: 'Bash',
    toolInput: { command: 'npm test' },
    choices: permissionChoices,
    status: 'waiting' as InteractiveStatus,
    onRespond: vi.fn(),
  };

  const defaultQuestionProps = {
    type: 'question' as const,
    toolName: 'AskUserQuestion',
    toolInput: {
      questions: [{
        question: 'Which option do you prefer?',
        header: 'Preference',
        options: [
          { label: 'Option A', description: 'First option' },
          { label: 'Option B', description: 'Second option' },
          { label: 'Option C' },
        ],
        multiSelect: false,
      }],
    },
    choices: questionChoices,
    status: 'waiting' as InteractiveStatus,
    onRespond: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // === Permission Mode Tests ===

  describe('Permission mode', () => {
    it('renders approve and reject buttons', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      expect(screen.getByLabelText('승인')).toBeInTheDocument();
      expect(screen.getByLabelText('거절')).toBeInTheDocument();
    });

    it('calls onRespond with approved=true when approve clicked', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      await user.click(screen.getByLabelText('승인'));
      expect(defaultPermissionProps.onRespond).toHaveBeenCalledWith(true);
    });

    it('calls onRespond with approved=false when reject clicked', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      await user.click(screen.getByLabelText('거절'));
      expect(defaultPermissionProps.onRespond).toHaveBeenCalledWith(false);
    });

    it('shows tool name in header', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      expect(screen.getByText(/권한 요청: Bash/)).toBeInTheDocument();
    });

    it('shows tool input details', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      expect(screen.getByText('npm test')).toBeInTheDocument();
    });
  });

  // === Question Mode Tests ===

  describe('Question mode', () => {
    it('renders choice buttons', () => {
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      expect(screen.getByLabelText('Option A')).toBeInTheDocument();
      expect(screen.getByLabelText('Option B')).toBeInTheDocument();
      expect(screen.getByLabelText('Option C')).toBeInTheDocument();
    });

    it('renders "Other" button', () => {
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      expect(screen.getByLabelText('기타 (직접 입력)')).toBeInTheDocument();
    });

    it('calls onRespond with selected choice value', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      await user.click(screen.getByLabelText('Option A'));
      expect(defaultQuestionProps.onRespond).toHaveBeenCalledWith(true, 'Option A');
    });

    it('shows question text from toolInput', () => {
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      expect(screen.getByText('Which option do you prefer?')).toBeInTheDocument();
    });
  });

  // === Multi-select Mode Tests ===

  describe('Multi-select mode', () => {
    const multiSelectProps = {
      ...defaultQuestionProps,
      multiSelect: true,
    };

    it('renders checkboxes instead of buttons', () => {
      render(<InteractiveResponseCard {...multiSelectProps} />);
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
    });

    it('renders submit button', () => {
      render(<InteractiveResponseCard {...multiSelectProps} />);
      expect(screen.getByLabelText('선택 제출')).toBeInTheDocument();
    });

    it('submit button is disabled when no selection', () => {
      render(<InteractiveResponseCard {...multiSelectProps} />);
      expect(screen.getByLabelText('선택 제출')).toBeDisabled();
    });

    it('calls onRespond with selected values on submit', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...multiSelectProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[2]);
      await user.click(screen.getByLabelText('선택 제출'));

      expect(multiSelectProps.onRespond).toHaveBeenCalledWith(
        true,
        expect.arrayContaining(['Option A', 'Option C'])
      );
    });
  });

  // === "Other" Text Input Tests ===

  describe('Other text input', () => {
    it('shows text input when "Other" clicked', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      await user.click(screen.getByLabelText('기타 (직접 입력)'));
      expect(screen.getByLabelText('기타 응답 입력')).toBeInTheDocument();
    });

    it('limits input to 1000 characters', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      await user.click(screen.getByLabelText('기타 (직접 입력)'));

      const input = screen.getByLabelText('기타 응답 입력');
      expect(input).toHaveAttribute('maxLength', '1000');
    });

    it('does not submit empty or whitespace-only input', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      await user.click(screen.getByLabelText('기타 (직접 입력)'));

      const submitBtn = screen.getByLabelText('기타 응답 제출');
      expect(submitBtn).toBeDisabled();

      const input = screen.getByLabelText('기타 응답 입력');
      await user.type(input, '   ');
      expect(submitBtn).toBeDisabled();
    });

    it('calls onRespond with trimmed text on submit', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      await user.click(screen.getByLabelText('기타 (직접 입력)'));

      const input = screen.getByLabelText('기타 응답 입력');
      await user.type(input, '  custom answer  ');
      await user.click(screen.getByLabelText('기타 응답 제출'));

      expect(defaultQuestionProps.onRespond).toHaveBeenCalledWith(true, 'custom answer');
    });

    it('submits on Enter key', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultQuestionProps} />);
      await user.click(screen.getByLabelText('기타 (직접 입력)'));

      const input = screen.getByLabelText('기타 응답 입력');
      await user.type(input, 'my answer');
      await user.keyboard('{Enter}');

      expect(defaultQuestionProps.onRespond).toHaveBeenCalledWith(true, 'my answer');
    });
  });

  // === Status Tests ===

  describe('Responded state', () => {
    it('shows response summary and disables buttons for permission', () => {
      render(
        <InteractiveResponseCard
          {...defaultPermissionProps}
          status="responded"
          response="승인됨"
        />
      );
      expect(screen.getByText('승인됨')).toBeInTheDocument();
      // Approve/reject buttons should not be visible in responded state
      expect(screen.queryByLabelText('승인')).not.toBeInTheDocument();
    });

    it('shows response for question type', () => {
      render(
        <InteractiveResponseCard
          {...defaultQuestionProps}
          status="responded"
          response="Option A"
        />
      );
      expect(screen.getByText('Option A')).toBeInTheDocument();
    });

    it('shows array response joined', () => {
      render(
        <InteractiveResponseCard
          {...defaultQuestionProps}
          status="responded"
          response={['Option A', 'Option C']}
        />
      );
      expect(screen.getByText('Option A, Option C')).toBeInTheDocument();
    });
  });

  describe('Sending state', () => {
    it('disables buttons and shows spinner', () => {
      render(
        <InteractiveResponseCard
          {...defaultPermissionProps}
          status="sending"
        />
      );
      expect(screen.getByLabelText('승인')).toBeDisabled();
      expect(screen.getByLabelText('거절')).toBeDisabled();
      expect(screen.getByLabelText('전송 중')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message and re-enables buttons', () => {
      render(
        <InteractiveResponseCard
          {...defaultPermissionProps}
          status="error"
          errorMessage="연결이 끊어졌습니다. 재연결 후 다시 시도하세요"
        />
      );
      expect(screen.getByText('연결이 끊어졌습니다. 재연결 후 다시 시도하세요')).toBeInTheDocument();
      // Buttons should be enabled for retry in error state
      expect(screen.getByLabelText('승인')).not.toBeDisabled();
    });
  });

  // === Accessibility Tests ===

  describe('Accessibility', () => {
    it('has role="group" and aria-labelledby', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      const card = screen.getByTestId('interactive-response-card');
      expect(card).toHaveAttribute('role', 'group');
      expect(card).toHaveAttribute('aria-labelledby');
    });

    it('all buttons have aria-label', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute('aria-label');
      });
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<InteractiveResponseCard {...defaultPermissionProps} />);

      // Tab to first button
      await user.tab();
      const approveBtn = screen.getByLabelText('승인');
      expect(approveBtn).toHaveFocus();

      // Tab to next button
      await user.tab();
      const rejectBtn = screen.getByLabelText('거절');
      expect(rejectBtn).toHaveFocus();

      // Enter to activate
      await user.keyboard('{Enter}');
      expect(defaultPermissionProps.onRespond).toHaveBeenCalledWith(false);
    });
  });

  // === Animation Tests ===

  describe('Animations', () => {
    it('applies fadeInUp animation class', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      const card = screen.getByTestId('interactive-response-card');
      expect(card.className).toContain('animate-fadeInUp');
    });

    it('applies motion-reduce to disable animations', () => {
      render(<InteractiveResponseCard {...defaultPermissionProps} />);
      const card = screen.getByTestId('interactive-response-card');
      expect(card.className).toContain('motion-reduce:animate-none');
    });
  });
});
