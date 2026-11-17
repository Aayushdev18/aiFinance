import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schemas.js';
import { AuthenticatedRequest } from '../../common/middleware/authenticate.js';

export class AuthController {
  public static async register(req: Request, res: Response) {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      });
    }

    try {
      const result = await AuthService.register(parseResult.data);
      return res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: result
      });
    } catch (err: any) {
      return res.status(409).json({
        error: 'Conflict',
        message: err.message
      });
    }
  }

  public static async login(req: Request, res: Response) {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: parseResult.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      });
    }

    try {
      const result = await AuthService.login(parseResult.data);
      return res.status(200).json({
        status: 'success',
        message: 'Authentication successful',
        data: result
      });
    } catch (err: any) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: err.message
      });
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        userId: req.user.id,
        email: req.user.email
      }
    });
  }
}
