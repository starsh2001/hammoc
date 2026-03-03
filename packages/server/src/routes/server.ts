import { Router } from 'express';
import { serverController } from '../controllers/serverController.js';

const router = Router();

router.get('/info', serverController.info);
router.post('/restart', serverController.restart);
router.get('/check-update', serverController.checkUpdate);
router.post('/update', serverController.update);
router.get('/build-status', serverController.buildStatus);

export default router;
