/**
 * ProjectCard - Displays a single project card with context menu
 * [Source: Story 3.2 - Task 3]
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Clock, MoreVertical, Trash2 } from 'lucide-react';
import type { ProjectInfo } from '@bmad-studio/shared';
import { formatRelativeTime, formatProjectPath } from '../utils/formatters';
import { ConfirmModal } from './ConfirmModal';

interface ProjectCardProps {
  project: ProjectInfo;
  onClick: (projectSlug: string) => void;
  onDelete?: (projectSlug: string, deleteFiles?: boolean) => void;
}

export function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (!menuOpen) {
      onClick(project.projectSlug);
    }
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    onDelete?.(project.projectSlug, deleteFiles);
    setDeleteFiles(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeleteFiles(false);
  };

  // Close menu on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [menuOpen, handleOutsideClick]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        className="relative w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer"
        aria-label={`프로젝트: ${formatProjectPath(project.originalPath)}, 세션 ${project.sessionCount}개`}
      >
        {/* Kebab menu */}
        {onDelete && (
          <div ref={menuRef} className="absolute top-2 right-2 z-10">
            <button
              type="button"
              onClick={handleMenuToggle}
              aria-label="프로젝트 메뉴"
              aria-expanded={menuOpen}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              <MoreVertical className="w-4 h-4" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
                role="menu"
              >
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  프로젝트 삭제
                </button>
              </div>
            )}
          </div>
        )}

        {/* Project Path */}
        <h3 className="font-medium text-gray-900 dark:text-white truncate mb-2 pr-6">
          {formatProjectPath(project.originalPath)}
        </h3>

        {/* BMad Badge */}
        {project.isBmadProject && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 mb-3">
            BMad
          </span>
        )}

        {/* Meta Information */}
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
          {/* Session Count */}
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            <span>{project.sessionCount}</span>
          </div>

          {/* Last Modified */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span>{formatRelativeTime(project.lastModified)}</span>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="프로젝트 삭제"
        message="세션 데이터가 모두 삭제됩니다."
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500 dark:bg-gray-700"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            프로젝트 파일도 함께 삭제
          </span>
        </label>
        {deleteFiles && (
          <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
            디스크의 프로젝트 파일이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        )}
      </ConfirmModal>
    </>
  );
}
