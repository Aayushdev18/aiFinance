import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../modules/auth/auth.service.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization bearer token'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = AuthService.verifyToken(token);
    if (payload.type !== 'access') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token type: expected access token'
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed: ' + (err.message || 'Expired or invalid token')
    });
  }
}
