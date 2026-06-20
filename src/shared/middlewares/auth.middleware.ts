import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express's Request interface so we can attach the user's data to the request object safely
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  // Extract the Authorization header (Format: 'Bearer <TOKEN>')
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access denied. No authentication token provided.' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    
    // Verify the cryptographic signature of the token
    const decoded = jwt.verify(token, secret) as { userId: number; role: string };
    
    // Attach the decoded payload properties directly to the request object for down-stream routes to use
    req.user = decoded;
    
    // Call next() to allow execution to proceed to the controller
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
};