import { Router } from 'express';
import { boardController, attachmentUpload } from '../controllers/boardController.js';

const router = Router();

router.get('/:projectSlug/board', boardController.getBoard);
router.get('/:projectSlug/board/issues', boardController.listIssues);
router.post('/:projectSlug/board/issues', boardController.createIssue);
router.patch('/:projectSlug/board/issues/:issueId', boardController.updateIssue);
router.delete('/:projectSlug/board/issues/:issueId', boardController.deleteIssue);
// Issue attachments
router.post('/:projectSlug/board/issues/:issueId/attachments', attachmentUpload, boardController.uploadAttachment);
router.get('/:projectSlug/board/issues/:issueId/attachments', boardController.listAttachments);
router.get('/:projectSlug/board/issues/:issueId/attachments/:filename', boardController.serveAttachment);
router.delete('/:projectSlug/board/issues/:issueId/attachments/:filename', boardController.deleteAttachment);

export default router;
