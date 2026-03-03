import { Request, Response } from 'express';
import { DEFAULT_BOARD_CONFIG, validateBoardConfig } from '@bmad-studio/shared';
import { projectService } from '../services/projectService.js';
import { issueService } from '../services/issueService.js';

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_ISSUE_TYPES = ['bug', 'improvement'];
const VALID_STATUSES = ['Open', 'InProgress', 'Done', 'Closed'];

export const boardController = {
  async getBoard(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const [result, settings] = await Promise.all([
        issueService.getBoard(projectRoot),
        projectService.readProjectSettings(projectRoot),
      ]);
      // Validate persisted config; fall back to default if malformed
      let config = DEFAULT_BOARD_CONFIG;
      if (settings.boardConfig) {
        const configErrors = validateBoardConfig(settings.boardConfig);
        config = configErrors.length === 0 ? settings.boardConfig : DEFAULT_BOARD_CONFIG;
      }
      res.json({ ...result, config });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `Project not found: ${req.params.projectSlug}` } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  },

  async listIssues(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const issues = await issueService.listIssues(projectRoot);
      res.json({ issues });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `Project not found: ${req.params.projectSlug}` } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  },

  async createIssue(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const { title, description, severity, issueType } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } });
        return;
      }

      if (severity && !VALID_SEVERITIES.includes(severity)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid severity: ${severity}` } });
        return;
      }

      if (issueType && !VALID_ISSUE_TYPES.includes(issueType)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid issueType: ${issueType}` } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const item = await issueService.createIssue(projectRoot, { title: title.trim(), description, severity, issueType });
      res.status(201).json(item);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `Project not found: ${req.params.projectSlug}` } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  },

  async updateIssue(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId } = req.params;
      const { severity, issueType, status } = req.body;

      if (severity && !VALID_SEVERITIES.includes(severity)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid severity: ${severity}` } });
        return;
      }

      if (issueType && !VALID_ISSUE_TYPES.includes(issueType)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid issueType: ${issueType}` } });
        return;
      }

      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${status}` } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const item = await issueService.updateIssue(projectRoot, issueId, req.body);
      res.json(item);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `Project not found: ${req.params.projectSlug}` } });
        return;
      }
      if (nodeError.code === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: `Issue not found: ${req.params.issueId}` } });
        return;
      }
      if (nodeError.code === 'INVALID_ISSUE_ID') {
        res.status(400).json({ error: { code: 'INVALID_ISSUE_ID', message: 'Invalid issue ID' } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  },

  async deleteIssue(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await issueService.deleteIssue(projectRoot, issueId);
      res.json({ message: 'Issue deleted' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: `Project not found: ${req.params.projectSlug}` } });
        return;
      }
      if (nodeError.code === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: `Issue not found: ${req.params.issueId}` } });
        return;
      }
      if (nodeError.code === 'INVALID_ISSUE_ID') {
        res.status(400).json({ error: { code: 'INVALID_ISSUE_ID', message: 'Invalid issue ID' } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  },
};
