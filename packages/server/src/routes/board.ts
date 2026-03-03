import { Router } from 'express';
import { boardController } from '../controllers/boardController.js';

const router = Router();

router.get('/:projectSlug/board', boardController.getBoard);
router.get('/:projectSlug/board/issues', boardController.listIssues);
router.post('/:projectSlug/board/issues', boardController.createIssue);
router.patch('/:projectSlug/board/issues/:issueId', boardController.updateIssue);
router.delete('/:projectSlug/board/issues/:issueId', boardController.deleteIssue);
router.post('/:projectSlug/board/stories/:storyNum/normalize-status', boardController.normalizeStoryStatus);

export default router;
