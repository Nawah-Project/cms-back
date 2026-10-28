import {
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AdminAccess } from '../admin/admin-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOURNEY_V4_NODES,
  JourneyNodeSeedItem,
} from '../journey-engine/journey-v4.seed';
import {
  demoCvPdf,
  HOME_SCENARIOS,
  type HomeScenario,
  makeHomePreview,
  type PeerScope,
  previewPeer,
  visiblePeers,
} from './home-preview.model';
export class HomePreviewQuery {
  @IsOptional() @IsIn(HOME_SCENARIOS) scenario: HomeScenario = 'START';
  @IsOptional() @IsIn(['GROUP', 'SPECIALTY', 'ALL']) scope: PeerScope =
    'SPECIALTY';
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeGroup = false;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page = 1;
}
@Injectable()
export class HomePreviewService {
  constructor(private readonly prisma: PrismaService) {}
  async nodes(): Promise<readonly JourneyNodeSeedItem[]> {
    const nodes = await this.prisma.journeyNode.findMany({
      orderBy: { orderIndex: 'asc' },
    });
    return nodes.length
      ? nodes.map((n) => ({
          ...n,
          descriptionAr: n.descriptionAr ?? '',
          descriptionEn: n.descriptionEn ?? '',
        }))
      : JOURNEY_V4_NODES;
  }
}
@Controller('admin/ux-lab/v2/home-preview')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('UX_LAB', 'READ')
export class HomePreviewController {
  constructor(private readonly preview: HomePreviewService) {}
  @Get() async home(@Query() q: HomePreviewQuery) {
    return makeHomePreview(q.scenario, await this.preview.nodes());
  }
  @Get('stations/:code/members') async members(
    @Param('code') code: string,
    @Query() q: HomePreviewQuery,
  ) {
    return visiblePeers(
      q.scenario,
      await this.preview.nodes(),
      code,
      q.scope,
      q.page,
      q.includeGroup,
    );
  }
  @Get('members/:id') async member(
    @Param('id') id: string,
    @Query() q: HomePreviewQuery,
  ) {
    return previewPeer(q.scenario, await this.preview.nodes(), id);
  }
  @Get('members/:id/cv') async cv(
    @Param('id') id: string,
    @Query() q: HomePreviewQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    const p = previewPeer(q.scenario, await this.preview.nodes(), id);
    if (!p.hasCv) throw new NotFoundException('No preview CV available');
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      'inline; filename="nawah-sample-cv.pdf"',
    );
    return new StreamableFile(demoCvPdf(p.nameEn, p.specialization));
  }
}
