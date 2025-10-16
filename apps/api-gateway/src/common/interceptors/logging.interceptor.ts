import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { CustomLoggerService } from '../logger/logger.service';

interface HttpError extends Error {
  readonly status?: number;
}

interface ErrorLike {
  message?: string;
  error?: string;
  details?: string;
}

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

function isHttpError(error: unknown): error is HttpError {
  return isError(error) && typeof (error as HttpError).status === 'number';
}

function isErrorLike(error: unknown): error is ErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('message' in error || 'error' in error || 'details' in error)
  );
}

function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (isErrorLike(error)) {
    return error.message ?? error.error ?? error.details ?? 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unparseable error object';
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: CustomLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, headers } = request;
    const userAgent = headers['user-agent'] ?? 'unknown';
    const startTime = Date.now();

    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    this.logger.info(
      `Incoming request: ${method} ${url}`,
      {
        method,
        url,
        userAgent,
        controller: controllerName,
        handler: handlerName,
        requestId: this.generateRequestId(),
      },
      'HttpInterceptor',
    );

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        this.logger.info(
          `Request completed: ${method} ${url} - ${statusCode}`,
          {
            method,
            url,
            statusCode,
            duration,
            controller: controllerName,
            handler: handlerName,
            success: true,
          },
          'HttpInterceptor',
        );
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - startTime;

        const statusCode = isHttpError(error) ? error.status : 500;

        const errorToLog = isError(error) ? error : undefined;

        const errorMessage = getErrorMessage(error);
        const errorName = isError(error) ? error.name : 'Unknown';

        this.logger.error(
          `Request failed: ${method} ${url} - ${statusCode}`,
          errorToLog,
          {
            method,
            url,
            statusCode,
            duration,
            controller: controllerName,
            handler: handlerName,
            success: false,
            errorMessage,
            errorName,
          },
          'HttpInterceptor',
        );

        throw error;
      }),
    );
  }

  private generateRequestId(): string {
    const randomPart = crypto.randomUUID().replace(/-/g, '').substring(0, 9);
    return `req_${Date.now()}_${randomPart}`;
  }
}
