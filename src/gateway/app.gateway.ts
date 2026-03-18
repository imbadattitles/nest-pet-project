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

  async handleConnection(client: Socket) {
    try {
      // Аутентификация
      const user = await this.authenticate(client);
      if (!user) {
        client.disconnect();
        return;
      }

      // Сохраняем соединение
      const userId = user.id;
      const userSockets = this.userSockets.get(userId) || [];
      this.userSockets.set(userId, [...userSockets, client.id]);
      
      // Отмечаем пользователя онлайн
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.add(userId);
        this.broadcastUserStatus(userId, true);
      }

      client.data.user = user;
      this.logger.log(`✅ User ${userId} connected [${client.id}]`);
      
      // Отправляем список онлайн пользователей
      client.emit('onlineUsers', Array.from(this.onlineUsers));
      
    } catch (error) {
      this.logger.error(`❌ Connection error: ${error.message}`);
      client.disconnect();
    }
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

  // ========== ХЕЛПЕРЫ ==========
  private async authenticate(client: Socket) {
    // Извлекаем токен
    const token = client.handshake.auth.token || 
                  client.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) return null;
    
    try {
      // Верифицируем токен (тут должна быть твоя логика)
      // const payload = await this.jwtService.verifyAsync(token);
      // return { id: payload.sub, username: payload.username };
      
      // Для примера возвращаем тестового пользователя
      return { id: '123', username: 'test' };
    } catch {
      return null;
    }
  }
}