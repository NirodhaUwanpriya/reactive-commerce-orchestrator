import { Router } from 'express';
import { checkoutCart } from './order.controller';
import { authenticateToken } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.post('/checkout', authenticateToken as any, checkoutCart as any);

export default router;