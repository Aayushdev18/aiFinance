import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate.js';

export function enforceTenantContext(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.user.id) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Active tenant context required for this operation'
    });
  }

  // In production with PostgreSQL pool:
  // pool.query(`SET LOCAL app.current_user_id = '${req.user.id}'`);
  // This guarantees Row-Level Security isolation at the database kernel.

  res.setHeader('X-Tenant-Id', req.user.id);
  next();
}
