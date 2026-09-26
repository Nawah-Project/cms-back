import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GroupsModule } from '../members/groups.module';
import { SocialAuthService } from './social-auth.service';

@Module({
  imports: [JwtModule.register({}), GroupsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, SocialAuthService],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
