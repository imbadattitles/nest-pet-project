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
import { Message } from 'src/chat/schemas/message.schema';

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
  private onlineSubscriptions = new Map<string, Set<string>>();

  constructor(
    private jwtWsService: JwtWsService,
    @Inject(forwardRef(() => PostsService))
    private postsService: PostsService,
    @Inject(forwardRef(() => CommentsService))
    private commentsService: CommentsService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    @Inject(forwardRef(() => ChatService))
    private chatService: ChatService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('✅ WebSocket инициализирован');
  }

  // ========== ПОДКЛЮЧЕНИЕ ==========
  async handleConnection(client: Socket) {
    try {
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

      // Сохраняем сокеты пользователя
      const existingSockets = this.userSockets.get(user.id) || [];
      existingSockets.push(client.id);
      this.userSockets.set(user.id, existingSockets);

      // Помечаем пользователя онлайн и оповещаем подписанных
      this.onlineUsers.add(user.id);
      this.broadcastUserStatus(user.id, true);

      // Подписываем на персональную комнату
      client.join(`user:${user.id}`);

      // Сохраняем данные в сокете
      user.contacts = userFromService.contacts;
      client.data.user = user;

      // Подписка на диалоги
      const dialogs = await this.chatService.getUserDialogs(user.id);
      for (const dialog of dialogs) {
        client.join(`dialog:${dialog._id}`);
      }

      // Подписка на посты
      const posts = await this.postsService.findByAuthor(user.id);
      for (const post of posts.posts) {
        client.join(`post:${post._id}`);
      }

      // Комнаты контактов (для будущих уведомлений)
      for (const contactId of user.contacts || []) {
        if (!contactId) {
          await this.usersService.removeContact(
            { id: userFromService.id },
            { userId: contactId },
          );
          continue;
        }
        client.join(`contact:${contactId}`);
      }

      // Подписка на онлайн-статусы всех друзей
      const friendsIds = await this.getUsersFriends(user.id);
      for (const friendId of friendsIds) {
        await this.subscribeToFriendOnline(user.id, friendId);
      }

      client.emit('authenticated', { message: 'Connected successfully' });
    } catch (error) {
      this.logger.error('Connection error', error);
      client.disconnect();
    }
  }

  // ========== ОТКЛЮЧЕНИЕ ==========
  handleDisconnect(client: Socket) {
    const userId = client.data.user?.id;

    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      const remainingSockets = sockets.filter((id) => id !== client.id);

      if (remainingSockets.length > 0) {
        this.userSockets.set(userId, remainingSockets);
      } else {
        // Все сокеты пользователя отключились
        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);
        this.onlineSubscriptions.delete(userId); // очищаем подписки
        this.broadcastUserStatus(userId, false);
      }
    }

    this.logger.log(`❌ Client disconnected: ${client.id}`);
  }

  // ========== ПОДПИСКА НА ОНЛАЙН ДРУЗЕЙ ==========
  private async subscribeToFriendOnline(
    userId: string,
    friendId: string,
  ): Promise<void> {
    if (!this.onlineSubscriptions.has(userId)) {
      this.onlineSubscriptions.set(userId, new Set());
    }
    const subs = this.onlineSubscriptions.get(userId)!;
    if (subs.has(friendId)) {
      return; // уже подписаны
    }

    subs.add(friendId);

    // Добавляем все сокеты пользователя в комнату для уведомлений о статусе friendId
    await this.addUserToRoom(userId, `online-subscribers:${friendId}`);

    // Отправляем текущий статус каждому сокету
    const isOnline = this.onlineUsers.has(friendId);
    const userSockets = this.userSockets.get(userId) || [];
    for (const socketId of userSockets) {
      // @ts-ignore
      const socket = this.server.sockets.get(socketId); // <-- исправлено
      if (socket) {
        socket.emit('users:status', {
          userId: friendId,
          isOnline,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private async ensureOnlineSubscriptions(
    userId: string,
    targetUserIds: string[],
  ) {
    for (const targetId of targetUserIds) {
      await this.subscribeToFriendOnline(userId, targetId);
    }
  }

  // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ КОМНАТ ==========
  private async addUserToRoom(
    userId: string,
    roomName: string,
    forceJoin: boolean = true,
  ) {
    // @ts-ignore
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
          this.logger.debug(
            `ℹ️ Socket ${socketId} already in room ${roomName}`,
          );
        }
      }
    }
  }
  private async removeUserFromRoom(
    userId: string,
    roomName: string,
  ): Promise<number> {
    const userSockets = this.userSockets.get(userId) || [];
    let removedCount = 0;
    // @ts-ignore
    for (const socketId of userSockets) {
      // @ts-ignore
      const socket = this.server.sockets.get(socketId); // <-- исправлено
      if (socket && socket.connected && socket.rooms.has(roomName)) {
        socket.leave(roomName);
        removedCount++;
      }
    }
    return removedCount;
  }

  // ========== ОНЛАЙН СТАТУС (изменённая рассылка) ==========
  private broadcastUserStatus(userId: string, isOnline: boolean) {
    this.server.to(`online-subscribers:${userId}`).emit('users:status', {
      userId,
      isOnline,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== ПОЛУЧЕНИЕ ДРУЗЕЙ ==========
  async getUsersFriends(userId: string) {
    return await this.chatService.getUserContactsAndDialogsUsers(userId);
  }

  // ========== ПОСТЫ ==========
  @SubscribeMessage('posts:subscribe')
  handleSubscribeToPost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId: string },
  ) {
    client.join(`post:${data.postId}`);
    this.logger.log(`📌 Client ${client.id} subscribed to post ${data.postId}`);
  }

  @SubscribeMessage('posts:unsubscribe')
  handleUnsubscribeFromPost(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { postId: string },
  ) {
    client.leave(`post:${data.postId}`);
  }

  sendNewComment(postId: string, comment: any) {
    this.server.to(`post:${postId}`).emit('posts:newComment', {
      postId,
      comment,
      timestamp: new Date().toISOString(),
    });
  }

  sendNewPost(post: any) {
    this.server.emit('posts:new', {
      post,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== УВЕДОМЛЕНИЯ ==========
  @SubscribeMessage('notifications:subscribe')
  handleSubscribeToNotifications(@ConnectedSocket() client: Socket) {
    const userId = client.data.user?.id;
    if (userId) client.join(`user:${userId}`);
  }

  sendNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notifications:new', {
      notification,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== ЧАТ ==========
  async sendMessageToDialog(
    dialogId: string,
    message: Message,
    dialog: Dialog,
  ) {
    // Подписываем участников на комнату диалога
    const joinPromises = dialog.participants.map((p) =>
      this.addUserToRoom(p._id.toString(), `dialog:${dialogId}`),
    );
    await Promise.all(joinPromises);

    // Отправляем сообщение в диалог
    this.server.to(`dialog:${dialogId}`).emit('chat:newMessage', {
      dialogId,
      message,
      timestamp: new Date().toISOString(),
    });

    // Проверяем и подписываем на онлайны участников диалога
    const participantIds = dialog.participants.map((p) => p._id.toString());
    for (const pid of participantIds) {
      const otherIds = participantIds.filter((id) => id !== pid);
      if (otherIds.length > 0) {
        await this.ensureOnlineSubscriptions(pid, otherIds);
      }
    }
  }

  async dialogDeleted(dialogId: string, participants: Types.ObjectId[]) {
    this.server
      .to(`dialog:${dialogId}`)
      .emit('chat:dialogDeleted', { dialogId });
    const leavePromises = participants.map((p) =>
      this.removeUserFromRoom(p.toString(), `dialog:${dialogId}`),
    );
    await Promise.all(leavePromises);
  }

  async messagesDeleted(
    dialogId: string,
    messagesId: Types.ObjectId[],
    userId: Types.ObjectId,
  ) {
    this.server.to(`dialog:${dialogId}`).emit('chat:messagesDeleted', {
      dialogId,
      messagesId,
      userId,
    });
  }

  async messageAsRead(
    dialogId: string,
    messageId: Types.ObjectId,
    userId: Types.ObjectId,
  ) {
    this.server.to(`dialog:${dialogId}`).emit('chat:messageAsRead', {
      dialogId,
      messageId,
      userId,
    });
  }

  @SubscribeMessage('chat:setAsRead')
  async setAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { messageId: Types.ObjectId; dialogId: Types.ObjectId },
  ) {
    await this.chatService.markSingleMessageAsRead(
      data.messageId,
      data.dialogId,
      client.data.user.id,
    );
  }

  @SubscribeMessage('chat:message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { to: string; message: string },
  ) {
    const fromUser = client.data.user;
    this.server.to(`user:${data.to}`).emit('chat:message', {
      from: fromUser.id,
      fromUsername: fromUser.username,
      message: data.message,
      timestamp: new Date().toISOString(),
    });

    client.emit('chat:sent', { to: data.to, message: data.message });

    // Гарантируем подписку на онлайны друг друга
    this.ensureOnlineSubscriptions(fromUser.id, [data.to]);
    this.ensureOnlineSubscriptions(data.to, [fromUser.id]);
  }

  // ========== ПОЛЬЗОВАТЕЛИ (оставлен для совместимости) ==========
  @SubscribeMessage('users:subscribe')
  handleSubscribeToUsers(@ConnectedSocket() client: Socket) {
    this.logger.warn(
      'users:subscribe is deprecated; online subscriptions are now automatic',
    );
  }

  private extractTokenFromCookie(cookieString: string): string | null {
    const cookies = cookieString.split(';').reduce(
      (acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      },
      {} as Record<string, string>,
    );
    return cookies['access_token'] || null;
  }
}
