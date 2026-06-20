import { Router } from 'express';
import { addItemToCart, getCart } from './cart.controller';
import { authenticateToken } from '../../shared/middlewares/auth.middleware';

const router = Router();

// Apply the token interceptor globally across ALL cart actions
router.use(authenticateToken as any);

router.post('/add', addItemToCart as any);
router.get('/', getCart as any);

export default router;