import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { AuthModule } from '../auth/auth.module';
import { NoResponseProcessor } from './no-response.processor';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, NoResponseProcessor],
  exports: [ApplicationsService, NoResponseProcessor],
})
export class ApplicationsModule {}
