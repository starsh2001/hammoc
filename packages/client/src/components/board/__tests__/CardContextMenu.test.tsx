/**
 * CardContextMenu Component Tests
 * [Source: Story 21.3 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardContextMenu } from '../CardContextMenu';
import type { BoardItem } from '@hammoc/shared';

const issueItem: BoardItem = {
  id: 'issue-1',
  type: 'issue',
  title: 'Fix login bug',
  status: 'Open',
  description: 'Login form does not validate',
  severity: 'high',
  issueType: 'bug',
};

const issueWithLinkedStory: BoardItem = {
  ...issueItem,
  linkedStory: 'story-21.1',
};

const issueWithLinkedEpic: BoardItem = {
  ...issueItem,
  linkedEpic: 'epic-21',
};

const issueInProgress: BoardItem = {
  ...issueItem,
  status: 'In Progress',
};

const issueReadyForReviewFail: BoardItem = {
  ...issueItem,
  status: 'Ready for Review',
  gateResult: 'FAIL',
};

const issueReadyForReview: BoardItem = {
  ...issueItem,
  status: 'Ready for Review',
};

const issueReadyForDone: BoardItem = {
  ...issueItem,
  status: 'Ready for Done',
};

const storyDraft: BoardItem = {
  id: 'story-21.1',
  type: 'story',
  title: 'Board API',
  status: 'Draft',
  epicNumber: 21,
};

const storyApproved: BoardItem = {
  ...storyDraft,
  status: 'Approved',
};

const storyReadyForReview: BoardItem = {
  ...storyDraft,
  status: 'Ready for Review',
};

const storyReadyForReviewPass: BoardItem = {
  ...storyDraft,
  status: 'Ready for Review',
  gateResult: 'PASS',
};

const storyReadyForReviewFail: BoardItem = {
  ...storyDraft,
  status: 'Ready for Review',
  gateResult: 'FAIL',
};

const storyDone: BoardItem = {
  ...storyDraft,
  status: 'Done',
};

const storyClosed: BoardItem = {
  ...storyDraft,
  status: 'Closed',
};

const epicItem: BoardItem = {
  id: 'epic-21',
  type: 'epic',
  title: 'Project Board',
  status: 'In Progress',
  epicNumber: 21,
  storyProgress: { total: 3, done: 1 },
};

describe('CardContextMenu', () => {
  const mockQuickFix = vi.fn();
  const mockPromote = vi.fn();
  const mockEdit = vi.fn();
  const mockClose = vi.fn();
  const mockWorkflowAction = vi.fn();
  const mockViewEpicStories = vi.fn();
  const mockIssueStatusChange = vi.fn();
  const mockRequestQAReview = vi.fn();

  const allCallbacks = {
    onQuickFix: mockQuickFix,
    onPromote: mockPromote,
    onEdit: mockEdit,
    onClose: mockClose,
    onWorkflowAction: mockWorkflowAction,
    onViewEpicStories: mockViewEpicStories,
    onIssueStatusChange: mockIssueStatusChange,
    onRequestQAReview: mockRequestQAReview,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue card menu', () => {
    it('should render 5 menu items for issue card', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));

      expect(screen.getByText('바로 작업하기')).toBeInTheDocument();
      expect(screen.getByText('스토리로 승격')).toBeInTheDocument();
      expect(screen.getByText('에픽으로 승격')).toBeInTheDocument();
      expect(screen.getByText('편집')).toBeInTheDocument();
      expect(screen.getByText('닫기')).toBeInTheDocument();
    });

    it('should disable "스토리로 승격" when linkedStory exists', () => {
      render(<CardContextMenu item={issueWithLinkedStory} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));

      const promoteBtn = screen.getByText('스토리로 승격');
      expect(promoteBtn).toBeDisabled();
      expect(promoteBtn).toHaveAttribute('title', '이미 스토리로 승격됨');
    });

    it('should disable "에픽으로 승격" when linkedEpic exists', () => {
      render(<CardContextMenu item={issueWithLinkedEpic} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));

      const promoteBtn = screen.getByText('에픽으로 승격');
      expect(promoteBtn).toBeDisabled();
      expect(promoteBtn).toHaveAttribute('title', '이미 에픽으로 승격됨');
    });

    it('should call onQuickFix when "바로 작업하기" is clicked', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('바로 작업하기'));

      expect(mockQuickFix).toHaveBeenCalledWith(issueItem);
    });

    it('should call onPromote with "story" when "스토리로 승격" is clicked', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('스토리로 승격'));

      expect(mockPromote).toHaveBeenCalledWith(issueItem, 'story');
    });

    it('should call onPromote with "epic" when "에픽으로 승격" is clicked', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('에픽으로 승격'));

      expect(mockPromote).toHaveBeenCalledWith(issueItem, 'epic');
    });

    it('should call onEdit when "편집" is clicked', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('편집'));

      expect(mockEdit).toHaveBeenCalledWith(issueItem);
    });

    it('should call onClose when "닫기" is clicked', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('닫기'));

      expect(mockClose).toHaveBeenCalledWith(issueItem);
    });

    it('should render "개발 이어하기" for In Progress issue', () => {
      render(<CardContextMenu item={issueInProgress} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('개발 이어하기')).toBeInTheDocument();
    });

    it('should call onWorkflowAction when "개발 이어하기" is clicked', () => {
      render(<CardContextMenu item={issueInProgress} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('개발 이어하기'));
      expect(mockWorkflowAction).toHaveBeenCalledWith(issueInProgress);
    });

    it('should render "QA 리뷰 요청" for Ready for Review issue', () => {
      render(<CardContextMenu item={issueReadyForReview} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('QA 리뷰 요청')).toBeInTheDocument();
    });

    it('should call onRequestQAReview when "QA 리뷰 요청" is clicked', () => {
      render(<CardContextMenu item={issueReadyForReview} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('QA 리뷰 요청'));
      expect(mockRequestQAReview).toHaveBeenCalledWith(issueReadyForReview);
    });

    it('should render "이슈 완료" and "QA 재요청" for Ready for Done issue', () => {
      render(<CardContextMenu item={issueReadyForDone} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('이슈 완료')).toBeInTheDocument();
      expect(screen.getByText('QA 재요청')).toBeInTheDocument();
    });

    it('should call onIssueStatusChange with Done when "이슈 완료" is clicked for Ready for Done issue', () => {
      render(<CardContextMenu item={issueReadyForDone} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('이슈 완료'));
      expect(mockIssueStatusChange).toHaveBeenCalledWith(issueReadyForDone, 'Done');
    });

    it('should render only "QA 수정 적용" for Ready for Review with FAIL gate', () => {
      render(<CardContextMenu item={issueReadyForReviewFail} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('QA 수정 적용')).toBeInTheDocument();
      expect(screen.queryByText('QA 리뷰 요청')).not.toBeInTheDocument();
    });

  });

  describe('Story card menu', () => {
    it('should render "스토리 검증 및 수정" for Draft status', () => {
      render(<CardContextMenu item={storyDraft} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('스토리 검증 및 수정')).toBeInTheDocument();
    });

    it('should render "개발 시작" for Approved status', () => {
      render(<CardContextMenu item={storyApproved} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('개발 시작')).toBeInTheDocument();
    });

    it('should render "스토리 리뷰" for Ready for Review status (no gate)', () => {
      render(<CardContextMenu item={storyReadyForReview} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('스토리 리뷰')).toBeInTheDocument();
    });

    it('should render "스토리 완료" for Ready for Review status with PASS gate', () => {
      render(<CardContextMenu item={storyReadyForReviewPass} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('스토리 완료')).toBeInTheDocument();
    });

    it('should render "QA 수정 적용" for Ready for Review status with FAIL gate', () => {
      render(<CardContextMenu item={storyReadyForReviewFail} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('QA 수정 적용')).toBeInTheDocument();
    });

    it('should render "QA 재요청" for Ready for Review status with PASS gate when onRequestQAReview provided', () => {
      const mockRequestQA = vi.fn();
      render(<CardContextMenu item={storyReadyForReviewPass} {...allCallbacks} onRequestQAReview={mockRequestQA} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('스토리 완료')).toBeInTheDocument();
      expect(screen.getByText('QA 재요청')).toBeInTheDocument();
    });

    it('should call onRequestQAReview when "QA 재요청" is clicked', () => {
      const mockRequestQA = vi.fn();
      render(<CardContextMenu item={storyReadyForReviewPass} {...allCallbacks} onRequestQAReview={mockRequestQA} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('QA 재요청'));
      expect(mockRequestQA).toHaveBeenCalledWith(storyReadyForReviewPass);
    });

    it('should not render "QA 재요청" for Ready for Review status without gate result', () => {
      const mockRequestQA = vi.fn();
      render(<CardContextMenu item={storyReadyForReview} {...allCallbacks} onRequestQAReview={mockRequestQA} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.queryByText('QA 재요청')).not.toBeInTheDocument();
    });

    it('should call onWorkflowAction when workflow action is clicked', () => {
      render(<CardContextMenu item={storyDraft} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('스토리 검증 및 수정'));
      expect(mockWorkflowAction).toHaveBeenCalledWith(storyDraft);
    });

    it('should not render menu button for Done story', () => {
      const { container } = render(<CardContextMenu item={storyDone} {...allCallbacks} />);
      expect(container.innerHTML).toBe('');
    });

    it('should not render menu button for Closed story', () => {
      const { container } = render(<CardContextMenu item={storyClosed} {...allCallbacks} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('Epic card menu', () => {
    it('should render "하위 스토리 보기" for epic card', () => {
      render(<CardContextMenu item={epicItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('하위 스토리 보기')).toBeInTheDocument();
    });

    it('should call onViewEpicStories when clicked', () => {
      render(<CardContextMenu item={epicItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      fireEvent.click(screen.getByText('하위 스토리 보기'));
      expect(mockViewEpicStories).toHaveBeenCalledWith(epicItem);
    });
  });

  describe('Menu behavior', () => {
    it('should close menu on outside click', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('바로 작업하기')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('바로 작업하기')).not.toBeInTheDocument();
    });

    it('should close menu on Escape key', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));
      expect(screen.getByText('바로 작업하기')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('바로 작업하기')).not.toBeInTheDocument();
    });

    it('should navigate menu items with ArrowDown and ArrowUp', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));

      // ArrowDown should focus first item
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      const firstItem = screen.getByText('바로 작업하기');
      expect(firstItem.className).toContain('bg-gray-100');

      // ArrowDown again should focus second item
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      const secondItem = screen.getByText('스토리로 승격');
      expect(secondItem.className).toContain('bg-gray-100');

      // ArrowUp should go back to first item
      fireEvent.keyDown(document, { key: 'ArrowUp' });
      expect(firstItem.className).toContain('bg-gray-100');
    });

    it('should select focused item with Enter', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      fireEvent.click(screen.getByLabelText('카드 메뉴'));

      fireEvent.keyDown(document, { key: 'ArrowDown' });
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(mockQuickFix).toHaveBeenCalledWith(issueItem);
    });

    it('should toggle menu on button click', () => {
      render(<CardContextMenu item={issueItem} {...allCallbacks} />);
      const button = screen.getByLabelText('카드 메뉴');

      fireEvent.click(button);
      expect(screen.getByText('바로 작업하기')).toBeInTheDocument();

      fireEvent.click(button);
      expect(screen.queryByText('바로 작업하기')).not.toBeInTheDocument();
    });
  });
});
