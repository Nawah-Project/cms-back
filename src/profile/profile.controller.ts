import {
  BadRequestException,
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Post,
  ParseUUIDPipe,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CV_MAX_FILE_SIZE_BYTES } from './profile.constants';
import { cvContentDisposition, validateCvFileMetadata } from './cv-file.util';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('profile')
  getProfile(@CurrentUser('id') userId: string) {
    return this.profile.getProfile(userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() body: UpdateProfileDto,
  ) {
    return this.profile.updateProfile(userId, body.portfolioUrl, body.name);
  }

  @Post('profile/cv')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CV_MAX_FILE_SIZE_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => {
        try {
          validateCvFileMetadata(file);
          callback(null, true);
        } catch (error) {
          callback(error as Error, false);
        }
      },
    }),
  )
  uploadCv(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('A CV PDF file is required');
    return this.profile.uploadCv(userId, file);
  }

  @Get('users/:userId/cv')
  async getCv(
    @CurrentUser('id') requesterId: string,
    @Res({ passthrough: true }) response: Response,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ) {
    const result = await this.profile.getCvForUser(requesterId, targetUserId);
    response.setHeader('Content-Type', result.metadata.mimeType);
    response.setHeader(
      'Content-Disposition',
      cvContentDisposition(result.metadata.originalName),
    );
    response.setHeader('Content-Length', result.metadata.size);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(createReadStream(result.filePath));
  }
}
