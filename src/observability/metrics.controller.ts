import { Controller, Get, Headers, Header, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { metricsRegistry } from './metrics.registry';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', metricsRegistry.contentType)
  async metrics(@Headers('authorization') authorization?: string): Promise<string> {
    const token = process.env.METRICS_TOKEN;
    if (!token) throw new ServiceUnavailableException('Metrics endpoint is not configured');
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expectedBuffer = Buffer.from(token);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw new UnauthorizedException();
    }
    return metricsRegistry.metrics();
  }
}
