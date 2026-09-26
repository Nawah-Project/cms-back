import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let logUnexpected = false;
    let payload: string | object = {
      statusCode: status,
      message: 'Internal server error',
    };

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          payload = {
            statusCode: status,
            message: 'A record with this value already exists',
          };
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          payload = {
            statusCode: status,
            message: 'The requested relationship is invalid',
          };
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          payload = {
            statusCode: status,
            message: 'The requested record was not found',
          };
          break;
        case 'P2034':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          payload = {
            statusCode: status,
            message: 'The request could not be completed; please retry',
          };
          break;
        default:
          logUnexpected = true;
          break;
      }
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
        payload = error.getResponse();
      } else {
        payload = { statusCode: status, message: 'Service unavailable' };
      }
    } else if (error instanceof Error && error.name === 'MulterError') {
      const code = (error as Error & { code?: string }).code;
      status =
        code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
      payload = {
        statusCode: status,
        message:
          code === 'LIMIT_FILE_SIZE'
            ? 'The uploaded file exceeds the allowed size'
            : 'Invalid file upload',
      };
    } else {
      logUnexpected = true;
    }

    if (logUnexpected) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Unhandled request failure (${errorName})`, stack);
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      payload = { statusCode: status, message: 'Internal server error' };
    }

    const response = host.switchToHttp().getResponse<Response>();
    response.status(status).json(payload);
  }
}
