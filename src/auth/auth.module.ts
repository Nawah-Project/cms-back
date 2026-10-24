import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GroupsModule } from '../members/groups.module';
import { SocialAuthService } from './social-auth.service';
import { EmailVerifierService } from './email-verifier.service';
import { EmailSenderService } from './email-sender.service';

@Module({
  imports: [JwtModule.register({}), GroupsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    SocialAuthService,
    EmailVerifierService,
    EmailSenderService,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    EmailVerifierService,
    EmailSenderService,
  ],
})
export class AuthModule {}
