import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private logger = new Logger('WsJwtGuard');

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // console.log(context)
    const client: Socket = context.switchToWs().getClient();
    
    try {
      // 1. Пробуем получить токен
      const token = this.extractToken(client);
      
      if (!token) {
        this.logger.warn('❌ WebSocket: нет токена');
        return false;
      }

      // 2. Верифицируем токен
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.access.secret'),
      });

      // 3. Сохраняем пользователя в client.data для использования в обработчиках
      client.data.user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
      };

      this.logger.log(`✅ WebSocket аутентифицирован: ${payload.username}`);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ Ошибка аутентификации WebSocket: ${error.message}`);
      return false;
    }
  }

  private extractToken(client: Socket): string | null {
    // Из auth параметров (то, что ты передаёшь в клиенте)
    // if (client.handshake.auth && client.handshake.auth.token) {
    //   return client.handshake.auth.token;
    // }

    // // Из заголовков
    // const authHeader = client.handshake.headers.authorization;
    // if (authHeader && authHeader.startsWith('Bearer ')) {
    //   return authHeader.split(' ')[1];
    // }

    // Из cookies (если нужно)
    const cookie = client.handshake.headers.cookie;
    if (cookie) {
      const match = cookie.match(/access_token=([^;]+)/);
      if (match) return match[1];
    }

    return null;
  }
}
