import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class HttpCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<Request>();
    const { httpAdapter } = this.httpAdapterHost;

    const requestMethod = httpAdapter.getRequestMethod(request) as string;
    const requestUrl = httpAdapter.getRequestUrl(request) as string;

    const isGetRequest = requestMethod === 'GET';
    const excludePrefixes = ['/api/metrics', '/api/alive'];

    if (
      !isGetRequest ||
      excludePrefixes.some((prefix) => requestUrl.startsWith(prefix))
    ) {
      return undefined;
    }

    return requestUrl;
  }
}