import { Router } from 'express';
import { boardController, attachmentUpload } from '../controllers/boardController.js';

const router = Router();

router.get('/:projectSlug/board', boardController.getBoard);
router.get('/:projectSlug/board/next-num', boardController.getNextNum);
router.get('/:projectSlug/board/issues', boardController.listIssues);
router.post('/:projectSlug/board/issues', boardController.createIssue);
router.patch('/:projectSlug/board/issues/:issueId', boardController.updateIssue);
router.delete('/:projectSlug/board/issues/:issueId', boardController.deleteIssue);
router.get('/:projectSlug/board/issues-legacy-count', boardController.legacyIssueCount);
router.post('/:projectSlug/board/issues-migrate', boardController.migrateIssues);
// Story status update
router.patch('/:projectSlug/board/stories/:storyId', boardController.updateStoryStatus);
// Issue attachments
router.post('/:projectSlug/board/issues/:issueId/attachments', attachmentUpload, boardController.uploadAttachment);
router.get('/:projectSlug/board/issues/:issueId/attachments', boardController.listAttachments);
router.get('/:projectSlug/board/issues/:issueId/attachments/:filename', boardController.serveAttachment);
router.delete('/:projectSlug/board/issues/:issueId/attachments/:filename', boardController.deleteAttachment);

export default router;
