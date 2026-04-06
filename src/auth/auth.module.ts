import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { RefreshTokenService } from './refresh-token.service';
import { CookieService } from './cookie.service';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { TempRegistrationService } from './temp-registration.service';
import { EmailService } from './email.service';
import { RedisService } from 'src/globalServices/redis.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({}), // Пустой регистр, так как используем разные секреты
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenStrategy,
    RefreshTokenStrategy,
    RefreshTokenService,
    CookieService,
    TempRegistrationService,
    EmailService,
    RedisService
  ],
  exports: [AuthService],
})
export class AuthModule {}