import { Module, Global } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtWsService } from '../auth/strategies/jwt-ws.service';
import { UsersModule } from 'src/users/users.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get('jwt.access.secret');
        console.log('JWT Secret loaded:', secret ? 'Yes' : 'No');
        return {
          secret: secret,
          signOptions: { expiresIn: configService.get('jwt.access.expiresIn') || '15m' },
        };
      },
      inject: [ConfigService],
    }),
    UsersModule, // 👈 КЛЮЧЕВОЙ МОМЕНТ: добавляем UsersModule в imports
  ],
  providers: [
    AppGateway,
    JwtWsService, // теперь UsersService будет доступен из UsersModule
  ],
  exports: [AppGateway, JwtWsService],
})
export class WebsocketModule {}