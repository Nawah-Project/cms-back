import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { finalize, Observable } from 'rxjs';
import { httpRequestDuration, httpRequests, httpRequestsInFlight, normalizedMethod, normalizedRoute } from './metrics.registry';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      route?: { path?: string | string[] };
      baseUrl?: string;
    }>();
    const response = context.switchToHttp().getResponse<{
      statusCode: number;
      once: (event: string, callback: () => void) => void;
    }>();
    const route = normalizedRoute(request);
    if (route === '/metrics') return next.handle();

    const method = normalizedMethod(request.method);
    const startedAt = process.hrtime.bigint();
    httpRequestsInFlight.labels(route, method).inc();
    let recorded = false;
    const record = (statusCode: number) => {
      if (recorded) return;
      recorded = true;
      const labels = { route, method, status_code: String(statusCode) };
      httpRequests.labels(labels).inc();
      httpRequestDuration.labels(labels).observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
      httpRequestsInFlight.labels(route, method).dec();
    };

    response.once('finish', () => record(response.statusCode));
    response.once('close', () => record(response.statusCode >= 400 ? response.statusCode : 499));
    return next.handle().pipe(finalize(() => {
      // The response events capture the final status after exception filters run.
      // This fallback prevents a leaked in-flight gauge if a custom adapter omits them.
      if (!recorded) record(response.statusCode || 500);
    }));
  }
}
