/**
 * DocumentStatusCard Tests
 * [Source: Story 12.3 - Task 4.1]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DocumentStatusCard } from '../DocumentStatusCard';
import type { BmadDocuments, BmadAuxDocument } from '@hammoc/shared';

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock uuid
vi.mock('../../../utils/uuid.js', () => ({
  generateUUID: () => 'mock-uuid-1234',
}));

const prdExists: BmadDocuments = {
  prd: { exists: true, path: 'docs/prd.md' },
  architecture: { exists: true, path: 'docs/architecture.md' },
  supplementary: [],
};

const prdMissing: BmadDocuments = {
  prd: { exists: false, path: 'docs/prd.md' },
  architecture: { exists: true, path: 'docs/architecture.md' },
  supplementary: [],
};

const archMissing: BmadDocuments = {
  prd: { exists: true, path: 'docs/prd.md' },
  architecture: { exists: false, path: 'docs/architecture.md' },
  supplementary: [],
};

const bothMissing: BmadDocuments = {
  prd: { exists: false, path: 'docs/prd.md' },
  architecture: { exists: false, path: 'docs/architecture.md' },
  supplementary: [],
};

const auxDocs: BmadAuxDocument[] = [
  { type: 'stories', path: 'docs/stories', fileCount: 5 },
  { type: 'qa', path: 'docs/qa', fileCount: 2 },
];

function renderCard(documents: BmadDocuments, auxiliaryDocuments: BmadAuxDocument[] = []) {
  return render(
    <MemoryRouter>
      <DocumentStatusCard
        documents={documents}
        auxiliaryDocuments={auxiliaryDocuments}
        projectSlug="test-slug"
      />
    </MemoryRouter>,
  );
}

describe('DocumentStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-DS-1: PRD exists shows CheckCircle icon and file path
  it('shows check icon and file path when PRD exists', () => {
    renderCard(prdExists);

    expect(screen.getByText('PRD')).toBeInTheDocument();
    expect(screen.getByText('docs/prd.md')).toBeInTheDocument();
    expect(screen.queryByText('작성 필요')).not.toBeInTheDocument();
  });

  // TC-DS-2: PRD missing shows XCircle icon and "작성 필요" badge
  it('shows X icon and "작성 필요" badge when PRD is missing', () => {
    renderCard(prdMissing);

    expect(screen.getByText('PRD')).toBeInTheDocument();
    const badges = screen.getAllByText('작성 필요');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  // TC-DS-3: Architecture exists shows file path
  it('shows file path when Architecture exists', () => {
    renderCard(prdExists);

    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('docs/architecture.md')).toBeInTheDocument();
  });

  // TC-DS-4: Architecture missing shows "작성 필요" badge
  it('shows "작성 필요" badge when Architecture is missing', () => {
    renderCard(archMissing);

    expect(screen.getByText('Architecture')).toBeInTheDocument();
    const badges = screen.getAllByText('작성 필요');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  // TC-DS-5: Auxiliary documents show with file count
  it('shows auxiliary documents with file count', () => {
    renderCard(prdExists, auxDocs);

    expect(screen.getByText('스토리')).toBeInTheDocument();
    expect(screen.getByText('5개')).toBeInTheDocument();

    expect(screen.getByText('QA')).toBeInTheDocument();
    expect(screen.getByText('2개')).toBeInTheDocument();
  });

  // TC-DS-6: No auxiliary documents hides the section
  it('hides auxiliary documents section when none exist', () => {
    renderCard(prdExists, []);

    expect(screen.queryByText('스토리')).not.toBeInTheDocument();
    expect(screen.queryByText('QA')).not.toBeInTheDocument();
  });

  // TC-DS-7: PRD missing "작성하러 가기" navigates to PM agent session
  it('navigates to PM agent session when PRD "작성하러 가기" is clicked', () => {
    renderCard(bothMissing);

    const buttons = screen.getAllByTitle('작성하러 가기');
    // First button is for PRD
    fireEvent.click(buttons[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/project/test-slug/session/mock-uuid-1234?agent=${encodeURIComponent('/BMad:agents:pm')}`,
    );
  });

  // TC-DS-8: Architecture missing "작성하러 가기" navigates to Architect agent session
  it('navigates to Architect agent session when Architecture "작성하러 가기" is clicked', () => {
    renderCard(bothMissing);

    const buttons = screen.getAllByTitle('작성하러 가기');
    // Second button is for Architecture
    fireEvent.click(buttons[1]);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/project/test-slug/session/mock-uuid-1234?agent=${encodeURIComponent('/BMad:agents:architect')}`,
    );
  });
});
