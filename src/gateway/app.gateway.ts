import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/auth-jwt.guard';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import { JwtWsService } from 'src/auth/strategies/jwt-ws.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  },
  namespace: 'events', // Один общий namespace
})

export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('AppGateway');
  private userSockets = new Map<string, string[]>(); // userId → socketIds[]
  private onlineUsers = new Set<string>();

  constructor(private jwtWsService: JwtWsService) {}

  // @UseGuards(AccessTokenGuard)
  async handleConnection(client: Socket) {
    try {
      console.log('Client connecting:', client.id);
      console.log('Cookies:', client.handshake.headers.cookie);

      // Извлекаем токен из куки
      const cookies = client.handshake.headers.cookie;
      if (!cookies) {
        console.log('No cookies, disconnecting');
        client.disconnect();
        return;
      }

      const accessToken = this.extractTokenFromCookie(cookies);
      if (!accessToken) {
        console.log('No access token, disconnecting');
        client.disconnect();
        return;
      }

      // Валидируем токен через наш сервис
      const user = await this.jwtWsService.validateToken(accessToken);
      
      // Сохраняем пользователя в данных сокета
      client.data.user = user;
      
      console.log('Client authenticated:', client.id, user);
      
      // Можно отправить событие об успешном подключении
      client.emit('authenticated', { message: 'Connected successfully' });

    } catch (error) {
      console.log('Authentication failed:', error.message);
      client.disconnect();
    }
  }
  private extractTokenFromCookie(cookieString: string): string | null {
    const cookies = cookieString.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return cookies['access_token'] || null;
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.user?.id;
    
    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      const remainingSockets = sockets.filter(id => id !== client.id);
      
      if (remainingSockets.length > 0) {
        this.userSockets.set(userId, remainingSockets);
      } else {
        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);
        this.broadcastUserStatus(userId, false);
      }
    }
    
    this.logger.log(`❌ Client disconnected: ${client.id}`);
  }

  // ========== ПОСТЫ ==========
  @SubscribeMessage('posts:subscribe')
  handleSubscribeToPost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId: string }
  ) {
    const room = `post:${data.postId}`;
    client.join(room);
    this.logger.log(`📌 Client ${client.id} subscribed to post ${data.postId}`);
    return { event: 'posts:subscribed', data: { postId: data.postId } };
  }

  @SubscribeMessage('posts:unsubscribe')
  handleUnsubscribeFromPost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId: string }
  ) {
    const room = `post:${data.postId}`;
    client.leave(room);
  }

  // Отправка нового комментария
  sendNewComment(postId: string, comment: any) {
    this.server.to(`post:${postId}`).emit('posts:newComment', {
      postId,
      comment,
      timestamp: new Date().toISOString(),
    });
  }

  // Отправка нового поста
  sendNewPost(post: any) {
    this.server.emit('posts:new', { post, timestamp: new Date().toISOString() });
  }

  // ========== УВЕДОМЛЕНИЯ ==========
  @SubscribeMessage('notifications:subscribe')
  handleSubscribeToNotifications(@ConnectedSocket() client: Socket) {
    const userId = client.data.user.id;
    client.join(`user:${userId}`);
    this.logger.log(`🔔 User ${userId} subscribed to notifications`);
  }

  sendNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notifications:new', {
      notification,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== ЧАТ ==========
  @SubscribeMessage('chat:message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { to: string; message: string }
  ) {
    const fromUser = client.data.user;
    
    // Отправляем конкретному пользователю
    this.server.to(`user:${data.to}`).emit('chat:message', {
      from: fromUser.id,
      fromUsername: fromUser.username,
      message: data.message,
      timestamp: new Date().toISOString(),
    });
    
    // Отправляем подтверждение отправителю
    client.emit('chat:sent', { to: data.to, message: data.message });
  }

  // ========== ОНЛАЙН СТАТУС ==========
  private broadcastUserStatus(userId: string, isOnline: boolean) {
    this.server.emit('users:status', {
      userId,
      isOnline,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== ПОЛЬЗОВАТЕЛИ ==========
  @SubscribeMessage('users:subscribe')
  handleSubscribeToUsers(@ConnectedSocket() client: Socket) {
    client.join('users:tracking');
    client.emit('users:online', Array.from(this.onlineUsers));
  }

}