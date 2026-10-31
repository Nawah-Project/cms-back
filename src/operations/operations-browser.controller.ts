import {
  ForbiddenException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OperationsCollectorService } from './operations-collector.service';
import { BrowserTimingsDto } from './operations.dto';
@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsBrowserController {
  constructor(private readonly collector: OperationsCollectorService) {}
  @Post('browser-timings') timings(
    @CurrentUser('id') id: string,
    @CurrentUser('role') role: string,
    @Body() body: BrowserTimingsDto,
  ) {
    if (body.accountId !== id)
      throw new ForbiddenException('Account changed; discard timing sample');
    return this.collector.browserTimings(id, role, body.timingsMs);
  }
}
