import { Body, Controller, Get, Module, Param, Put, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaModule } from '../prisma/prisma.module';
import { ExperienceService, EXPERIENCE_FLOWS } from './experience.service';

export class ExperienceProgressDto {
  @IsIn(['IN_PROGRESS', 'COMPLETED', 'SKIPPED'])
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

  @IsInt()
  @Min(0)
  @Max(100)
  currentStep: number;
}

export class ExperienceFlowParam {
  @IsIn([...EXPERIENCE_FLOWS])
  flowKey: string;
}

@Controller('experience/progress')
@UseGuards(JwtAuthGuard)
export class ExperienceController {
  constructor(private readonly experience: ExperienceService) {}

  @Get()
  getProgress(@CurrentUser('id') userId: string) {
    return this.experience.getProgress(userId);
  }

  @Put(':flowKey')
  saveProgress(@CurrentUser('id') userId: string, @Param() params: ExperienceFlowParam, @Body() dto: ExperienceProgressDto) {
    return this.experience.saveProgress(userId, params.flowKey, dto.status, dto.currentStep);
  }
}

@Module({ imports: [AuthModule, PrismaModule], controllers: [ExperienceController], providers: [ExperienceService] })
export class ExperienceModule {}
