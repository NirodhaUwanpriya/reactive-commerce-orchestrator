import { Router } from 'express';
import { registerUser, loginUser } from './user.controller';
import { authenticateToken } from '../../shared/middlewares/auth.middleware';

const router = Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected routes (require authentication)
// These would need corresponding controller functions
// router.get('/profile', authenticateToken, getUserProfile);
// router.put('/profile', authenticateToken, updateUserProfile);

export default router;