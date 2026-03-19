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
    const client: Socket = context.switchToWs().getClient();
    console.log('asdasdada')
    try {
      const token = this.extractToken(client);
      
      if (!token) {
        this.logger.warn('❌ Нет токена');
        return false;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.access.secret'),
      });

      // Сохраняем пользователя в клиенте
      client.data.user = payload;
      
      this.logger.log(`✅ WebSocket аутентифицирован: ${payload.username || payload.email}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Ошибка аутентификации WebSocket: ${error.message}`);
      return false;
    }
  }

  private extractToken(client: Socket): string | null {
    // Из заголовков
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }

    // Из auth параметров
    if (client.handshake.auth && client.handshake.auth.token) {
      return client.handshake.auth.token;
    }

    // Из cookies (если есть)
    if (client.handshake.headers.cookie) {
      const cookies = this.parseCookies(client.handshake.headers.cookie);
      if (cookies.access_token) {
        return cookies.access_token;
      }
    }

    return null;
  }

  private parseCookies(cookieString: string): Record<string, string> {
    return cookieString.split(';').reduce((cookies, cookie) => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
      return cookies;
    }, {});
  }
}