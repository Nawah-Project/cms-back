import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminFullAccess } from './admin-access';
import { AdminAccessService } from './admin-access.service';
import { AdminGuard } from './admin.guard';
import { UpdateAdminAccessDto } from './dto/update-admin-access.dto';

@Controller('admin/access')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminFullAccess()
export class AdminAccessController {
  constructor(private readonly access: AdminAccessService) {}

  @Get('admins')
  list() {
    return this.access.list();
  }

  @Put('admins/:id')
  update(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) targetId: string,
    @Body() body: UpdateAdminAccessDto,
  ) {
    return this.access.update(actorId, targetId, body);
  }
}
