import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { CircuitBreaker } from './circuit-breaker';
import { catchError } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private readonly circuitBreakerByHandler = new WeakMap<
    Function,
    CircuitBreaker
  >();

  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const methodRef = context.getHandler();

    const circuitBreaker = this.circuitBreakerByHandler.has(methodRef)
      ? this.circuitBreakerByHandler.get(methodRef)!
      : (() => {
          const newCircuitBreaker = new CircuitBreaker(this.configService, {
            successThreshold: this.configService.get<number>(
              'CIRCUIT_BREAKER_SUCCESS_THRESHOLD',
              3,
            ),
            failureThreshold: this.configService.get<number>(
              'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
              3,
            ),
            openToHalfOpenWaitTime: this.configService.get<number>(
              'CIRCUIT_BREAKER_OPEN_TO_HALF_OPEN_WAIT_TIME',
              60000,
            ),
            fallback: () => {
              throw new HttpException(
                'Service unavailable. Please try again later.',
                HttpStatus.SERVICE_UNAVAILABLE,
              );
            },
          });
          this.circuitBreakerByHandler.set(methodRef, newCircuitBreaker);
          return newCircuitBreaker;
        })();

    return circuitBreaker.exec(next).pipe(
      catchError(() => {
        return throwError(
          () =>
            new HttpException(
              'Internal server error',
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
        );
      }),
    );
  }
}
