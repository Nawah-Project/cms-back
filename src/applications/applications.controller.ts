import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateApplicationDto,
  ) {
    return this.applicationsService.create(userId, createDto);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ApplicationQueryDto,
  ) {
    return this.applicationsService.findAll(userId, query);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser('id') userId: string) {
    return this.applicationsService.getDashboard(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.applicationsService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateApplicationDto,
  ) {
    return this.applicationsService.update(userId, id, updateDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.applicationsService.remove(userId, id);
  }
}
