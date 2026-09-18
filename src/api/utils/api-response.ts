import { Response } from 'express';

export class ApiResponse {
  public static success<T>(res: Response, data: T, message = 'Success', statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  public static error(res: Response, message = 'Internal Server Error', statusCode = 500, errors: any = null): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }
}