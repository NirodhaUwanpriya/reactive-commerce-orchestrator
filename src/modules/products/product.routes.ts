import { Router } from 'express';
import { getProductById, createProduct } from './product.controller';
import { authenticateToken } from '../../shared/middlewares/auth.middleware';

const router = Router();

// Product creation requires authentication (admin/authorized users)
router.post('/', authenticateToken as any, createProduct as any);
// Product viewing is public
router.get('/:id', getProductById);

export default router;