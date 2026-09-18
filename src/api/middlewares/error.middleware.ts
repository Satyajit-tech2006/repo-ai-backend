import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/api-response';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('[API Error]:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  return ApiResponse.error(res, message, status, err.stack);
}