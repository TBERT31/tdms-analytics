import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import {
  buildOpenIdClient,
  OidcStrategy,
} from '../common/strategies/oidc.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionSerializer } from './session.serializer';

const OidcStrategyFactory = {
  provide: 'OidcStrategy',
  useFactory: async (authService: AuthService) => {
    const issuerConfig = await buildOpenIdClient();
    authService.setIssuerConfig(issuerConfig);
    return new OidcStrategy(authService, issuerConfig);
  },
  inject: [AuthService],
};

@Module({
  imports: [
    PassportModule.register({ session: true, defaultStrategy: 'oidc' }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, OidcStrategyFactory, SessionSerializer],
})
export class AuthModule {}
