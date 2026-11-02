import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../admin/admin.guard';
import { AdminAccess } from '../admin/admin-access';
import { CV_MAX_FILE_SIZE_BYTES } from '../profile/profile.constants';
import {
  cvContentDisposition,
  validateCvFileMetadata,
} from '../profile/cv-file.util';
import { CareerConsultingService } from './consulting.service';
import {
  CaseUpdateDto,
  CommentDto,
  ConsentDto,
  CreateCaseDto,
  DecisionDto,
  FileDto,
  ItemDto,
  ListDto,
  PublishDto,
  RequestDto,
  ResponseDto,
  ReviewDto,
  SharingDto,
  StateDto,
} from './consulting.dto';
// Shared routes still authorize against the database in every service operation.
abstract class ConsultingController {
  protected abstract readonly member: boolean;
  constructor(protected readonly service: CareerConsultingService) {}
  @Get('cases') list(@CurrentUser('id') actor: string, @Query() q: ListDto) {
    return this.service.list(actor, q, this.member);
  }
  @Get('cases/:id') detail(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(actor, id, this.member);
  }
  @Post('cases/:id/comments') comment(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CommentDto,
  ) {
    return this.service.comment(actor, id, d, this.member);
  }
  @Post('cases/:id/files')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CV_MAX_FILE_SIZE_BYTES, files: 1, fields: 1 },
      fileFilter: (_req, file, cb) => {
        try {
          validateCvFileMetadata(file);
          cb(null, true);
        } catch (e) {
          cb(e as Error, false);
        }
      },
    }),
  )
  upload(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: FileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.service.upload(actor, id, d.requestId, file, this.member);
  }
  @Post('cases/:id/files/:fileId/share') share(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() d: RequestDto,
  ) {
    return this.service.shareFile(actor, id, fileId, d, this.member);
  }
  @Get('cases/:id/files/:fileId') async file(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.file(actor, id, fileId, this.member);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      cvContentDisposition(f.metadata.originalName),
    );
    res.setHeader('Content-Length', f.metadata.size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(f.path));
  }
}
@Controller('admin/career-consulting')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('CAREER_CONSULTING')
export class ConsultingAdminController extends ConsultingController {
  protected readonly member = false;
  constructor(service: CareerConsultingService) {
    super(service);
  }
  @Get('catalog') catalog(@CurrentUser('id') actor: string) {
    return this.service.catalog(actor);
  }
  @Get('candidates') @AdminAccess('CAREER_CONSULTING', 'WRITE') candidates(
    @CurrentUser('id') actor: string,
    @Query('search') search?: string,
  ) {
    return this.service.candidates(actor, search);
  }
  @Get('staff') staff(@CurrentUser('id') actor: string) {
    return this.service.staffList(actor);
  }
  @Post('cases') create(
    @CurrentUser('id') actor: string,
    @Body() d: CreateCaseDto,
  ) {
    return this.service.create(actor, d);
  }
  @Patch('cases/:id') update(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CaseUpdateDto,
  ) {
    return this.service.update(actor, id, d);
  }
  @Post('cases/:id/state') state(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: StateDto,
  ) {
    return this.service.state(actor, id, d);
  }
  @Delete('cases/:id') remove(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RequestDto,
  ) {
    return this.service.remove(actor, id, d);
  }
  @Get('cases/:id/programme') programme(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.programme(actor, id);
  }
  @Get('cases/:id/programme-cv')
  async programmeCv(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.programmeCv(actor, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      cvContentDisposition(f.metadata.originalName),
    );
    res.setHeader('Content-Length', f.metadata.size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(f.filePath));
  }
  @Post('cases/:id/items') item(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ItemDto,
  ) {
    return this.service.saveItem(actor, id, d);
  }
  @Patch('cases/:id/items/:itemId') editItem(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() d: ItemDto,
  ) {
    return this.service.saveItem(actor, id, d, itemId);
  }
  @Post('cases/:id/items/:itemId/publish') publish(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() d: PublishDto,
  ) {
    return this.service.publish(actor, id, itemId, d);
  }
  @Post('cases/:id/submissions/:submissionId/review') review(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() d: ReviewDto,
  ) {
    return this.service.review(actor, id, submissionId, d);
  }
}
@Controller('career-consulting')
@UseGuards(JwtAuthGuard)
export class ConsultingMemberController extends ConsultingController {
  protected readonly member = true;
  constructor(service: CareerConsultingService) {
    super(service);
  }
  @Get('availability') availability(@CurrentUser('id') actor: string) {
    return this.service.availability(actor);
  }
  @Post('cases/:id/accept') accept(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ConsentDto,
  ) {
    return this.service.accept(actor, id, d);
  }
  @Post('cases/:id/withdraw') withdraw(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RequestDto,
  ) {
    return this.service.withdraw(actor, id, d);
  }
  @Post('cases/:id/programme-sharing') sharing(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SharingDto,
  ) {
    return this.service.sharing(actor, id, d);
  }
  @Post('cases/:id/response-draft') draft(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ResponseDto,
  ) {
    return this.service.saveResponse(actor, id, d);
  }
  @Post('cases/:id/submissions') submit(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ResponseDto,
  ) {
    return this.service.saveResponse(actor, id, d, true);
  }
  @Post('cases/:id/decisions') decide(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DecisionDto,
  ) {
    return this.service.decide(actor, id, d);
  }
}
