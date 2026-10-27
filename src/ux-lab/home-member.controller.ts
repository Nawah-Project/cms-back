import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HomePreviewQuery } from './home-preview.controller';
import { HomeMemberService } from './home-member.service';
@Controller('home')
@UseGuards(JwtAuthGuard)
export class HomeMemberController {
  constructor(private readonly home: HomeMemberService) {}
  @Get() get(@CurrentUser('id') id: string) {
    return this.home.home(id);
  }
  @Get('stations/:code/members') peers(
    @CurrentUser('id') id: string,
    @Param('code') code: string,
    @Query() q: HomePreviewQuery,
  ) {
    return this.home.peers(id, code, q.scope, q.page, q.includeGroup);
  }
  @Get('members/:target') peer(
    @CurrentUser('id') id: string,
    @Param('target', ParseUUIDPipe) target: string,
  ) {
    return this.home.peer(id, target);
  }
  @Get('members/:target/cv') async cv(
    @CurrentUser('id') id: string,
    @Param('target', ParseUUIDPipe) target: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.home.cv(id, target);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(result.filePath));
  }
}
