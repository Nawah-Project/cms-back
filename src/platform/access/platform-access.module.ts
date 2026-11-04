import { VerifiedEmailGuard } from './verified-email.guard';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SessionGuard } from './session.guard';
import { SessionAuthenticator } from './session.port';
import { LegacySessionAdapter } from './legacy-session.adapter';
import { AdministratorGuard } from './administrator.guard';

// Adapter over the current identity system. Feature modules import this boundary,
// never AuthService, AdminService, or programme eligibility services.
@Module({
  imports: [AuthModule],
  providers: [VerifiedEmailGuard,SessionGuard, AdministratorGuard, LegacySessionAdapter, { provide: SessionAuthenticator, useExisting: LegacySessionAdapter }],
  exports: [VerifiedEmailGuard,SessionGuard, AdministratorGuard, SessionAuthenticator],
})
export class PlatformAccessModule {}
