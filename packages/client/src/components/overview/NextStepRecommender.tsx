/**
 * NextStepRecommender - Context-aware action recommendations for BMad projects.
 * Analyzes current project state and suggests the most relevant next steps
 * based on the BMad workflow (Document phase → Implementation phase).
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Lightbulb,
  Search,
  Users,
  ClipboardList,
  Blocks,
  Palette,
  LayoutDashboard,
  Code,
  CheckCircle,
  Wrench,
  ShieldCheck,
  Play,
  PlusCircle,
  ArrowRight,
  ListOrdered,
  FolderOpen,
  Plus,
  PartyPopper,
} from 'lucide-react';
import type { BmadStatusResponse } from '@hammoc/shared';

import { computeNextSteps, type NextStepRecommendation } from '../../utils/bmadRecommendations.js';
import { generateUUID } from '../../utils/uuid.js';
import { boardApi } from '../../services/api/board.js';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-text': FileText,
  lightbulb: Lightbulb,
  search: Search,
  users: Users,
  clipboard: ClipboardList,
  blocks: Blocks,
  palette: Palette,
  layout: LayoutDashboard,
  code: Code,
  'check-circle': CheckCircle,
  wrench: Wrench,
  'shield-check': ShieldCheck,
  play: Play,
  'plus-circle': PlusCircle,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RecommendationButton({
  rec,
  onClick,
}: {
  rec: NextStepRecommendation;
  onClick: () => void;
}) {
  const Icon = ICON_MAP[rec.iconKey] ?? ArrowRight;
  const isPrimary = rec.variant === 'primary';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left cursor-pointer ${
        isPrimary
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
          : 'bg-gray-100/80 dark:bg-[#253040]/50 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040]'
      }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${isPrimary ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium block">{rec.title}</span>
        <span className={`text-xs block truncate ${isPrimary ? 'text-blue-600/70 dark:text-blue-400/70' : 'text-gray-500 dark:text-gray-300'}`}>
          {rec.description}
        </span>
      </div>
      <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 ${isPrimary ? 'text-blue-400 dark:text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface NextStepRecommenderProps {
  data: BmadStatusResponse;
  projectSlug: string;
}

export function NextStepRecommender({ data, projectSlug }: NextStepRecommenderProps) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { phase, recommendations } = computeNextSteps(data);

  const handleAction = async (rec: NextStepRecommendation) => {
    // Approved story → transition to In Progress before starting dev session
    if (rec.id === 'start-dev' && rec.storyFile) {
      try {
        const storyId = `story-${rec.storyFile.match(/^(\d+\.\d+)/)?.[1] ?? rec.storyFile}`;
        await boardApi.updateIssue(projectSlug, storyId, { status: 'In Progress' });
      } catch (err) {
        console.warn('Failed to transition story to In Progress:', err);
      }
    }

    const sessionId = generateUUID();
    const params = new URLSearchParams({ agent: rec.agentCommand });
    if (rec.taskCommand) {
      params.set('task', rec.taskCommand);
    }
    if (rec.chainPrompts) {
      for (const prompt of rec.chainPrompts) {
        params.append('chain', prompt);
      }
    }
    navigate(`/project/${projectSlug}/session/${sessionId}?${params.toString()}`);
  };

  const handleNewSession = () => {
    const sessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${sessionId}`);
  };

  const isCompleted = phase.phase === 'completed';

  return (
    <div className="bg-gray-50 dark:bg-[#263240] rounded-xl border border-gray-200 dark:border-[#253040] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">
          {isCompleted ? t('nextSteps.title') : t('nextSteps.tasks')}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isCompleted
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
        }`}>
          {isCompleted && <PartyPopper className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
          {phase.label}
        </span>
      </div>

      {/* Recommendation buttons */}
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <RecommendationButton
            key={rec.id}
            rec={rec}
            onClick={() => handleAction(rec)}
          />
        ))}
      </div>

      {/* Quick links */}
      <div className="mt-4 pt-3 border-t border-gray-200 dark:border-[#253040] flex items-center gap-3">
        <button
          onClick={handleNewSession}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          {t('nextSteps.newSession')}
        </button>
        <span className="text-gray-200 dark:text-gray-700">|</span>
        <button
          onClick={() => navigate(`/project/${projectSlug}/queue`)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 cursor-pointer"
        >
          <ListOrdered className="w-3 h-3" />
          {t('nextSteps.queueTask')}
        </button>
        <span className="text-gray-200 dark:text-gray-700">|</span>
        <button
          onClick={() => navigate(`/project/${projectSlug}/files`)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 cursor-pointer"
        >
          <FolderOpen className="w-3 h-3" />
          {t('nextSteps.fileExplore')}
        </button>
      </div>
    </div>
  );
}
