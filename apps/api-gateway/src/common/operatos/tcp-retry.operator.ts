import { timer, throwError, Observable } from 'rxjs';
import { catchError, retry, tap } from 'rxjs/operators';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

const tcpRetryAttemps = process.env.TCP_RETRY_ATTEMPTS
  ? parseInt(process.env.TCP_RETRY_ATTEMPTS, 10)
  : 3;

const tcpRetryDelayMs = process.env.TCP_RETRY_DELAY_MS
  ? parseInt(process.env.TCP_RETRY_DELAY_MS, 10)
  : 3;

function isErrorWithCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return (error as { message: string }).message;
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return `[object ${error.constructor?.name ?? 'Object'}]`;
    }
  }

  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'boolean') {
    return String(error);
  }
  return 'Unknown error';
}

export function tcpRetryOperator<T>(
  serviceIdentifier: string,
  maxRetries: number = tcpRetryAttemps,
) {
  return function (source: Observable<T>): Observable<T> {
    return source.pipe(
      tap(() =>
        console.log(
          `➡️ Attempting TCP microservice call to ${serviceIdentifier} (initial attempt)...`,
        ),
      ),
      retry({
        count: maxRetries,
        delay: (error: unknown, retryCount: number) => {
          const errorMessage = extractErrorMessage(error);

          console.warn(
            `⚠️ Retry attempt ${retryCount}/${maxRetries} for TCP microservice ${serviceIdentifier}. Error: ${errorMessage}`,
          );

          if (error instanceof RpcException) {
            console.error(
              `🛑 Not retrying for RpcException from ${serviceIdentifier}. Propagating error immediately.`,
            );
            return throwError(() => error);
          }

          const delayTime = Math.min(60000, 2 ** retryCount * tcpRetryDelayMs);
          console.log(
            `⏳ Waiting ${delayTime / tcpRetryDelayMs} seconds before next retry for ${serviceIdentifier}...`,
          );
          return timer(delayTime);
        },
      }),
      catchError((error: unknown) => {
        const errorMessage = extractErrorMessage(error);

        console.error(
          `❌ Final error after all ${maxRetries} retries failed for TCP microservice ${serviceIdentifier}: ${errorMessage}`,
        );

        if (error instanceof RpcException) {
          const rpcErrorMessage =
            error.message ??
            `Microservice ${serviceIdentifier} returned an error after attempts.`;

          throw new HttpException(
            {
              message: rpcErrorMessage,
              error: 'Microservice Error',
              statusCode: HttpStatus.BAD_GATEWAY,
            },
            HttpStatus.BAD_GATEWAY,
          );
        } else if (
          isErrorWithCode(error) &&
          ['ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)
        ) {
          throw new HttpException(
            `Microservice ${serviceIdentifier} is unreachable after several attempts (network or service problem).`,
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        } else {
          throw new HttpException(
            `An unknown error occurred with microservice ${serviceIdentifier} after attempts. Details: ${errorMessage}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }),
    );
  };
}
