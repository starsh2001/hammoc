/**
 * Onboarding 체크리스트 아이템 상태
 */
export type ChecklistItemStatus = 'complete' | 'incomplete' | 'optional';

/**
 * Onboarding 체크리스트 아이템
 */
export interface OnboardingChecklistItem {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  description?: string;
  command?: string; // 설정 명령어
  isOptional?: boolean; // 선택 항목 여부
}
