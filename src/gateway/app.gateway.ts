import { PostsService } from './../posts/posts.service';
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
import { forwardRef, Inject, Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/guards/auth-jwt.guard';
import { AccessTokenGuard } from 'src/auth/guards/access-token.guard';
import { JwtWsService } from 'src/auth/strategies/jwt-ws.service';
import { UsersService } from 'src/users/users.service';
import { CommentsService } from 'src/comments/comments.service';
import { ChatService } from 'src/chat/chat.service';
import { Dialog } from 'src/chat/schemas/dialog.schema';
import { Types } from 'mongoose';

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

    constructor(
    private jwtWsService: JwtWsService,
    @Inject(forwardRef(() => PostsService))
    private postsService: PostsService,
    @Inject(forwardRef(() => CommentsService))
    private commentsService: CommentsService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    @Inject(forwardRef(() => ChatService))
    private chatService: ChatService
  ) {}
  // private intervalId: NodeJS.Timeout;
  // private messageCount = 0;

  afterInit(server: Server) {
    this.logger.log('✅ WebSocket инициализирован');
    // console
    
    // Запускаем интервал после инициализации сервера
    // this.intervalId = setInterval(() => {
    //   this.messageCount++;
      
    //   // Отправляем всем подключенным клиентам
    //   this.server.emit('periodic-message', {
    //     id: this.messageCount,
    //     message: `Привет от сервера! Сообщение #${this.messageCount}`,
    //     timestamp: new Date().toISOString(),
    //     randomNumber: Math.floor(Math.random() * 100),
    //   });
      
    //   this.logger.log(`📨 Отправлено сообщение #${this.messageCount}`);
    // }, 5000); // 5000ms = 5 секунд
  }
  // @UseGuards(AccessTokenGuard)
  async handleConnection(client: Socket) {
    try {


      // Извлекаем токен из куки
      const cookies = client.handshake.headers.cookie;
      if (!cookies) {
        client.disconnect();
        return;
      }

      const accessToken = this.extractTokenFromCookie(cookies);
      if (!accessToken) {
        client.disconnect();
        return;
      }
      
      // Валидируем токен через наш сервис
      const user: {
        id: string;
        username: string;
        email: string;
        contacts?: string[];
      } = await this.jwtWsService.validateToken(accessToken);
      const userFromService = await this.usersService.findMyProfile(user.id);

      if (!userFromService) {
        client.disconnect();
        return;
      }
      this.userSockets.set(user.id, [client.id]);
      
      client.join(`user:${user.id}`);
      user.contacts = userFromService.contacts; // Добавляем контакты в данные пользователя
      // Сохраняем пользователя в данных сокета
      client.data.user = user;

      const dialogs = await this.chatService.getUserDialogs(user.id);
      for (const dialog of dialogs) {
        // console.log(`📌 Client ${client.id} joined room for dialog ${dialog._id}`);
        client.join(`dialog:${dialog._id}`);
      }
      const posts = await this.postsService.findByAuthor(user.id);
      for (const post of posts.posts) {
        // console.log(`📌 Client ${client.id} joined room for post ${post._id}`);
        client.join(`post:${post._id}`);
      }
      for (const contactId of user.contacts || []) {
        if (!contactId) {
          await this.usersService.removeContact({ id: userFromService.id }, { userId: contactId })
          continue;
        };
        // console.log(`📌 Client ${client.id} joined room for contact ${contactId}`);
        client.join(`contact:${contactId}`);
      }
      
      
      // Можно отправить событие об успешном подключении
      client.emit('authenticated', { message: 'Connected successfully' });

    } catch (error) {
      client.disconnect();
    }
  }
  private async addUserToRoom(userId: string, roomName: string, forceJoin: boolean = true) {
    const userSockets = this.userSockets.get(userId) || [];
    let joinedCount = 0;
    
    for (const socketId of userSockets) {
      // @ts-ignore
      const socket = this.server.sockets.get(socketId);
      if (socket && socket.connected) {
        // Проверяем, состоит ли уже в комнате (опционально)
        const isAlreadyInRoom = socket.rooms.has(roomName);
        
        if (!isAlreadyInRoom || forceJoin) {
          socket.join(roomName);
          joinedCount++;
          this.logger.debug(`✅ Added socket ${socketId} to room ${roomName}`);
        } else {
          this.logger.debug(`ℹ️ Socket ${socketId} already in room ${roomName}`);
        }
      }
    }
    
    if (joinedCount > 0) {
      this.logger.log(`✅ Added ${joinedCount} sockets of user ${userId} to room ${roomName}`);
    }
    
    return joinedCount;
  }
  private async removeUserFromRoom(userId: string, roomName: string): Promise<number> {
    const userSockets = this.userSockets.get(userId) || [];
    let removedCount = 0;
    
    for (const socketId of userSockets) {
      // @ts-ignore
      const socket = this.server.sockets.get(socketId);
      if (socket && socket.connected) {
        const isInRoom = socket.rooms.has(roomName);
        
        if (isInRoom) {
          socket.leave(roomName);
          removedCount++;
          this.logger.debug(`✅ Removed socket ${socketId} from room ${roomName}`);
        } else {
          this.logger.debug(`ℹ️ Socket ${socketId} not in room ${roomName}`);
        }
      }
    }
    
    if (removedCount > 0) {
      this.logger.log(`✅ Removed ${removedCount} sockets of user ${userId} from room ${roomName}`);
    }
    
    return removedCount;
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
    // console.log(`🔔 Sending new comment to post ${postId}:`, comment);
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
    const userId = client.id;
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
  async sendMessageToDialog(dialogId: string, message: any, dialog:Dialog) {
    const promises = dialog.participants.map(participant => 
      this.addUserToRoom(participant._id.toString(), `dialog:${dialogId}`)
    );
    
    await Promise.all(promises);
    this.server.to(`dialog:${dialogId}`).emit('chat:newMessage', {
      dialogId,
      message,
      dialog,
      timestamp: new Date().toISOString(),
    });
  }

  async dialogDeleted(dialogId: string, partificants:Types.ObjectId[]) {
    this.server.to(`dialog:${dialogId}`).emit('chat:dialogDeleted', {
      dialogId
    });
    const promises = partificants.map(participant => 
      this.removeUserFromRoom(participant.toString(), `dialog:${dialogId}`)
    );
    await Promise.all(promises);
  }

  async messagesDeleted(dialogId: string, messagesId:Types.ObjectId[]) {
    this.server.to(`dialog:${dialogId}`).emit('chat:messagesDeleted', {
      dialogId,
      messagesId
    });
  }
  async messageAsRead(dialogId: string, messageId:Types.ObjectId, userId:Types.ObjectId) {
    this.server.to(`dialog:${dialogId}`).emit('chat:messageAsRead', {
      dialogId,
      messageId,
      userId
    });
  }

  @SubscribeMessage('chat:setAsRead') 
  async setAsRead(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: Types.ObjectId, dialogId: Types.ObjectId }) {
    await this.chatService.markSingleMessageAsRead(data.messageId, data.dialogId, client.data.user.id);
  }

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