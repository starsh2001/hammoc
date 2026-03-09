import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DEFAULT_BOARD_CONFIG, validateBoardConfig } from '@hammoc/shared';
import { projectService } from '../services/projectService.js';
import { issueService } from '../services/issueService.js';

const rawUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('file');

/** Wraps multer middleware to catch MulterError and return structured JSON */
export function attachmentUpload(req: Request, res: Response, next: NextFunction): void {
  rawUpload(req, res, (err: unknown) => {
    if (err) {
      if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: req.t!('board.validation.fileTooLarge') } });
        return;
      }
      res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: (err as Error).message || 'Upload failed' } });
      return;
    }
    next();
  });
}

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_ISSUE_TYPES = ['bug', 'improvement'];
const VALID_STATUSES = ['Open', 'InProgress', 'Done', 'Closed', 'Promoted'];

export const boardController = {
  async getBoard(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const settings = await projectService.readProjectSettings(projectRoot);
      // Validate persisted config; fall back to default if malformed
      let config = DEFAULT_BOARD_CONFIG;
      if (settings.boardConfig) {
        const configErrors = validateBoardConfig(settings.boardConfig);
        config = configErrors.length === 0 ? settings.boardConfig : DEFAULT_BOARD_CONFIG;
      }
      const result = await issueService.getBoard(projectRoot, config.customStatusMappings);
      res.json({ ...result, config });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      if (nodeError.code === 'NOT_BMAD_PROJECT') {
        // Return empty board for non-BMad projects instead of 500
        res.json({ items: [], config: DEFAULT_BOARD_CONFIG });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
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
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async createIssue(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug } = req.params;
      const { title, description, severity, issueType } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.titleRequired') } });
        return;
      }

      if (severity && !VALID_SEVERITIES.includes(severity)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.invalidSeverity', { value: severity }) } });
        return;
      }

      if (issueType && !VALID_ISSUE_TYPES.includes(issueType)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.invalidIssueType', { value: issueType }) } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const item = await issueService.createIssue(projectRoot, { title: title.trim(), description, severity, issueType });
      res.status(201).json(item);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async updateIssue(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId } = req.params;
      const { severity, issueType, status } = req.body;

      if (severity && !VALID_SEVERITIES.includes(severity)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.invalidSeverity', { value: severity }) } });
        return;
      }

      if (issueType && !VALID_ISSUE_TYPES.includes(issueType)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.invalidIssueType', { value: issueType }) } });
        return;
      }

      if (status && !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.invalidStatus', { value: status }) } });
        return;
      }

      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const item = await issueService.updateIssue(projectRoot, issueId, req.body);
      res.json(item);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      if (nodeError.code === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: req.t!('board.error.issueNotFound', { value: req.params.issueId }) } });
        return;
      }
      if (nodeError.code === 'INVALID_ISSUE_ID') {
        res.status(400).json({ error: { code: 'INVALID_ISSUE_ID', message: req.t!('board.validation.invalidIssueId') } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async normalizeStoryStatus(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, storyNum } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const normalizedStatus = await issueService.normalizeStoryStatus(projectRoot, storyNum);
      res.json({ status: normalizedStatus });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      if (nodeError.code === 'STORY_NOT_FOUND') {
        res.status(404).json({ error: { code: 'STORY_NOT_FOUND', message: req.t!('board.error.storyNotFound', { value: req.params.storyNum }) } });
        return;
      }
      if (nodeError.code === 'STATUS_NOT_FOUND') {
        res.status(404).json({ error: { code: 'STATUS_NOT_FOUND', message: req.t!('board.error.statusNotFound', { value: req.params.storyNum }) } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async deleteIssue(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await issueService.deleteIssue(projectRoot, issueId);
      res.json({ message: req.t!('board.success.issueDeleted') });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      if (nodeError.code === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: req.t!('board.error.issueNotFound', { value: req.params.issueId }) } });
        return;
      }
      if (nodeError.code === 'INVALID_ISSUE_ID') {
        res.status(400).json({ error: { code: 'INVALID_ISSUE_ID', message: req.t!('board.validation.invalidIssueId') } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async uploadAttachment(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId } = req.params;
      if (!req.file) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: req.t!('board.validation.fileRequired') } });
        return;
      }
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const attachment = await issueService.addAttachment(projectRoot, issueId, {
        originalname: req.file.originalname,
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
      res.status(201).json({ attachment });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      if (nodeError.code === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: req.t!('board.error.issueNotFound', { value: req.params.issueId }) } });
        return;
      }
      if (nodeError.code === 'INVALID_ISSUE_ID') {
        res.status(400).json({ error: { code: 'INVALID_ISSUE_ID', message: req.t!('board.validation.invalidIssueId') } });
        return;
      }
      if (nodeError.code === 'INVALID_FILE_TYPE') {
        res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: req.t!('board.validation.invalidFileType') } });
        return;
      }
      if (nodeError.code === 'FILE_TOO_LARGE') {
        res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: req.t!('board.validation.fileTooLarge') } });
        return;
      }
      if (nodeError.code === 'MAX_ATTACHMENTS') {
        res.status(400).json({ error: { code: 'MAX_ATTACHMENTS', message: req.t!('board.validation.maxAttachments') } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async listAttachments(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const attachments = await issueService.listAttachments(projectRoot, issueId);
      res.json({ attachments });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async serveAttachment(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId, filename } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      const filePath = await issueService.resolveAttachmentPath(projectRoot, issueId, filename);
      if (!filePath) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });
        return;
      }
      res.sendFile(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },

  async deleteAttachment(req: Request, res: Response): Promise<void> {
    try {
      const { projectSlug, issueId, filename } = req.params;
      const projectRoot = await projectService.resolveOriginalPath(projectSlug);
      await issueService.removeAttachment(projectRoot, issueId, filename);
      res.json({ message: 'Attachment deleted' });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'PROJECT_NOT_FOUND') {
        res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: req.t!('board.error.projectNotFound', { value: req.params.projectSlug }) } });
        return;
      }
      if (nodeError.code === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: { code: 'ISSUE_NOT_FOUND', message: req.t!('board.error.issueNotFound', { value: req.params.issueId }) } });
        return;
      }
      if (nodeError.code === 'INVALID_ISSUE_ID') {
        res.status(400).json({ error: { code: 'INVALID_ISSUE_ID', message: req.t!('board.validation.invalidIssueId') } });
        return;
      }
      if (nodeError.code === 'INVALID_FILENAME') {
        res.status(400).json({ error: { code: 'INVALID_FILENAME', message: req.t!('board.validation.invalidFilename') } });
        return;
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: req.t!('board.error.internal') } });
    }
  },
};
