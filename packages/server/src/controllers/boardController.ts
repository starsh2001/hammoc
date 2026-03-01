import { Request, Response } from 'express';
import { projectService } from '../services/projectService.js';
import { issueService } from '../services/issueService.js';

export const boardController = {
  async getBoard(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const result = await issueService.getBoard(projectRoot);
      res.json(result);
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
