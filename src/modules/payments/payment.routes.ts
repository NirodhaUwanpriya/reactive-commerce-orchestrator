import { Router } from 'express';
import { processPayment } from './payment.controller';
import { authenticateToken } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.post('/charge', authenticateToken as any, processPayment as any);

export default router;