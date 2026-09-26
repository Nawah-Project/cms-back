import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    error: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    let responseError: HttpException;
    switch (error.code) {
      case 'P2002':
        responseError = new ConflictException(
          'A record with this value already exists',
        );
        break;
      case 'P2003':
        responseError = new BadRequestException(
          'The requested relationship is invalid',
        );
        break;
      case 'P2025':
        responseError = new NotFoundException(
          'The requested record was not found',
        );
        break;
      case 'P2034':
        responseError = new ServiceUnavailableException(
          'The request could not be completed; please retry',
        );
        break;
      default:
        responseError = new InternalServerErrorException(
          'A database operation failed',
        );
    }
    const response = host.switchToHttp().getResponse<Response>();
    response
      .status(responseError.getStatus())
      .json(responseError.getResponse());
  }
}
