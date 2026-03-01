// Epic 21: Project Board types (Story 21.1)

export type BoardItemType = 'issue' | 'story' | 'epic';
export type BoardItemStatus = 'Open' | 'Draft' | 'Approved' | 'InProgress' | 'Review' | 'Done' | 'Closed';

export interface BoardItem {
  id: string;
  type: BoardItemType;
  title: string;
  status: BoardItemStatus;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  epicNumber?: number;
  storyProgress?: {
    total: number;
    done: number;
  };
  linkedStory?: string;
  linkedEpic?: string;
  externalRef?: string;
}

export interface BoardResponse {
  items: BoardItem[];
}

export interface CreateIssueRequest {
  title: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
}

export interface UpdateIssueRequest {
  title?: string;
  description?: string;
  status?: 'Open' | 'InProgress' | 'Done' | 'Closed';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  issueType?: 'bug' | 'improvement';
  linkedStory?: string;
  linkedEpic?: string;
}
