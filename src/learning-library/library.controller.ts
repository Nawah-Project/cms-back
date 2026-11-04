import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { VerifiedEmailGuard } from '../platform/access/verified-email.guard';
import { SessionGuard } from '../platform/access/session.guard';
import { AdministratorGuard } from '../platform/access/administrator.guard';
import { AdminAccess, hasAdminAccess } from '../platform/access/admin-access';
import { LibraryRepository, type LibraryActor } from './library.port';
import { LibraryFilesService } from './infrastructure/library-files.service';
import type { Command } from './domain/types';
class MutationDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsObject() command!: Command;
}
class StartDto {
  @IsUUID() editionId!: string;
}
class InboxDto {
  @IsString() @MaxLength(300) name!: string;
}
interface LibraryRequest extends Request {
  administrator: LibraryActor;
}
@Controller('admin/learning-library')
@UseGuards(ThrottlerGuard, SessionGuard, AdministratorGuard, VerifiedEmailGuard)
@AdminAccess('LEARNING_LIBRARY')
export class LearningLibraryController {
  constructor(
    private readonly repo: LibraryRepository,
    private readonly files: LibraryFilesService,
  ) {}
  @Get('access') @Header('Cache-Control', 'private, no-store') access(
    @Req() r: LibraryRequest,
  ) {
    return {
      ownerId: r.administrator.id,
      canWrite: hasAdminAccess(
        r.administrator.permissions,
        ['LEARNING_LIBRARY'],
        'WRITE',
        r.administrator.isRoot,
      ),
    };
  }
  @Get() @Header('Cache-Control', 'private, no-store') load(
    @Req() r: LibraryRequest,
  ) {
    return this.repo.load(r.administrator.id);
  }
  @Post('commands') @Header('Cache-Control', 'private, no-store') mutate(
    @Req() r: LibraryRequest,
    @Body() dto: MutationDto,
  ) {
    return this.repo.mutate(
      r.administrator.id,
      dto.expectedRevision,
      dto.command,
    );
  }
  @Post('restore') @Header('Cache-Control', 'private, no-store') restore(
    @Req() r: LibraryRequest,
    @Body() dto: MutationDto,
  ) {
    if (dto.command.type !== 'restore') throw new BadRequestException();
    return this.repo.mutate(
      r.administrator.id,
      dto.expectedRevision,
      dto.command,
    );
  }
  @Get('export') @Header('Cache-Control', 'private, no-store') export(
    @Req() r: LibraryRequest,
  ) {
    return this.repo.load(r.administrator.id);
  }
  @Get('transfers') @Header('Cache-Control', 'private, no-store') transfers(
    @Req() r: LibraryRequest,
  ) {
    return this.files.list(r.administrator.id);
  }
  @Post('transfers') @Header('Cache-Control', 'private, no-store') start(
    @Req() r: LibraryRequest,
    @Body() dto: StartDto,
  ) {
    return this.files.start(r.administrator.id, dto.editionId);
  }
  @Post('transfers/:id/chunks')
  @Header('Cache-Control', 'private, no-store')
  chunk(
    @Req() r: LibraryRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('offset') offset: string,
    @Query('sha256') hash: string,
  ) {
    return this.files.chunk(
      r.administrator.id,
      id,
      Number(offset),
      hash,
      r.body,
    );
  }
  @Post('transfers/:id/finish')
  @Header('Cache-Control', 'private, no-store')
  finish(@Req() r: LibraryRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.finish(r.administrator.id, id);
  }
  @Delete('transfers/:id') @Header('Cache-Control', 'private, no-store') remove(
    @Req() r: LibraryRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.remove(r.administrator.id, id);
  }
  @Get('files/:id') download(
    @Req() r: LibraryRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    return this.files.download(r.administrator.id, id, r, res);
  }
  @Get('inbox') @Header('Cache-Control', 'private, no-store') inbox(
    @Req() r: LibraryRequest,
  ) {
    return this.files.inboxList(r.administrator.id);
  }
  @Post('transfers/:id/import')
  @Header('Cache-Control', 'private, no-store')
  import(
    @Req() r: LibraryRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InboxDto,
  ) {
    return this.files.importInbox(r.administrator.id, id, dto.name);
  }
}
