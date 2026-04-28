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
import { forwardRef, Inject, Logger } from '@nestjs/common';
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
  namespace: 'events',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('AppGateway');
  private userSockets = new Map<string, string[]>();
  private onlineUsers = new Set<string>();
  private onlineSubscriptions = new Map<string, Set<string>>();

  // Кеши времён последнего входа/выхода для быстрой рассылки (синхронизированы с БД)
  private lastConnectCache = new Map<string, string | null>();
  private lastDisconnectCache = new Map<string, string | null>();

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

      const existingSockets = this.userSockets.get(user.id) || [];
      existingSockets.push(client.id);
      this.userSockets.set(user.id, existingSockets);

      this.onlineUsers.add(user.id);

      // Обновляем lastConnect в БД и кеше
      await this.usersService.updateLastConnect(user.id);
      this.lastConnectCache.set(user.id, new Date().toISOString());
      this.lastDisconnectCache.set(user.id, null); // сброс времени дисконнекта

      this.broadcastUserStatus(user.id, true);

      client.join(`user:${user.id}`);
      user.contacts = userFromService.contacts.map((id) => id.toString());
      client.data.user = user;

      const dialogs = await this.chatService.getUserDialogs(user.id);
      for (const dialog of dialogs) {
        client.join(`dialog:${dialog._id}`);
      }

      const posts = await this.postsService.findByAuthor(user.id);
      for (const post of posts.posts) {
        client.join(`post:${post._id}`);
      }

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
        // Полное отключение – сохраняем время в БД и кеше
        this.usersService
          .updateLastDisconnect(userId)
          .catch((err) =>
            this.logger.error(
              `Failed to update lastDisconnect for ${userId}`,
              err,
            ),
          );

        const disconnectTime = new Date().toISOString();
        this.lastDisconnectCache.set(userId, disconnectTime);
        // lastConnectCache остаётся без изменений (последний вход не пропадает)

        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);
        this.onlineSubscriptions.delete(userId);
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
      return;
    }

    subs.add(friendId);
    await this.addUserToRoom(userId, `online-subscribers:${friendId}`);

    const isOnline = this.onlineUsers.has(friendId);
    let lastConnect: string | null = null;
    let lastDisconnect: string | null = null;

    if (!isOnline) {
      // друга нет в онлайне → получаем данные из кеша или БД
      if (this.lastDisconnectCache.has(friendId)) {
        lastDisconnect = this.lastDisconnectCache.get(friendId) || null;
        // lastConnect тоже мог быть закеширован ранее
        lastConnect = this.lastConnectCache.has(friendId)
          ? this.lastConnectCache.get(friendId) || null
          : null;
      } else {
        // Загружаем из БД и заполняем кеш
        await this.fetchAndCacheUserStatus(friendId);
        lastConnect = this.lastConnectCache.get(friendId) || null;
        lastDisconnect = this.lastDisconnectCache.get(friendId) || null;
      }
    } else {
      // Друг онлайн – lastDisconnect должен быть null, а lastConnect можно взять из кеша
      if (this.lastConnectCache.has(friendId)) {
        lastConnect = this.lastConnectCache.get(friendId) || null;
      } else {
        // Запрашиваем из БД, чтобы иметь актуальное время входа
        await this.fetchAndCacheUserStatus(friendId);
        lastConnect = this.lastConnectCache.get(friendId) || null;
      }
      lastDisconnect = null;
    }

    // Отправляем начальный статус каждому сокету пользователя
    const userSockets = this.userSockets.get(userId) || [];
    for (const socketId of userSockets) {
      // @ts-ignore
      const socket = this.server.sockets.get(socketId);
      if (socket) {
        socket.emit('users:status', {
          userId: friendId,
          isOnline,
          timestamp: new Date().toISOString(),
          lastConnect,
          lastDisconnect,
        });
      }
    }
  }

  /**
   * Загружает lastConnect и lastDisconnect из БД и сохраняет в кеш.
   */
  private async fetchAndCacheUserStatus(userId: string): Promise<void> {
    const status = await this.usersService.getUserOnlineStatus(userId);
    this.lastConnectCache.set(
      userId,
      status.lastConnect?.toISOString() || null,
    );
    this.lastDisconnectCache.set(
      userId,
      status.lastDisconnect?.toISOString() || null,
    );
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
      const socket = this.server.sockets.get(socketId);
      if (socket && socket.connected && socket.rooms.has(roomName)) {
        socket.leave(roomName);
        removedCount++;
      }
    }
    return removedCount;
  }

  // ========== ОНЛАЙН СТАТУС ==========
  private broadcastUserStatus(userId: string, isOnline: boolean) {
    let lastConnect: string | null = null;
    let lastDisconnect: string | null = null;

    if (isOnline) {
      lastDisconnect = null;
      lastConnect = this.lastConnectCache.get(userId) ?? null;
    } else {
      lastConnect = this.lastConnectCache.get(userId) ?? null;
      lastDisconnect = this.lastDisconnectCache.get(userId) ?? null;

      // Если кеш пуст (например, после перезапуска сервера) – асинхронно заполняем
      if (lastDisconnect === undefined || lastDisconnect === null) {
        this.fetchAndCacheUserStatus(userId)
          .then(() => {
            // После загрузки можно было бы повторно эмитить статус, но чтобы не усложнять – оставим так.
          })
          .catch((err) =>
            this.logger.error(`Failed to fetch status for ${userId}`, err),
          );
      }
    }

    this.server.to(`online-subscribers:${userId}`).emit('users:status', {
      userId,
      isOnline,
      timestamp: new Date().toISOString(),
      lastConnect,
      lastDisconnect,
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
    const joinPromises = dialog.participants.map((p) =>
      this.addUserToRoom(p._id.toString(), `dialog:${dialogId}`),
    );
    await Promise.all(joinPromises);
    console.log('joinPromises', joinPromises);
    console.log('dialog.participants', dialog.participants);
    this.server.to(`dialog:${dialogId}`).emit('chat:newMessage', {
      dialogId,
      message,
      timestamp: new Date().toISOString(),
    });

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

  async dialogRead(dialogId: string, userId: string) {
    console.log('dialogRead', dialogId, userId);
    this.server.to(`dialog:${dialogId}`).emit('chat:dialogRead', {
      dialogId,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('chat:setAsRead')
  async setAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dialogId: Types.ObjectId },
  ) {
    console.log(
      'setAsRead event:',
      data.dialogId.toString(),
      client.data.user.id,
    );
    await this.chatService.markDialogAsRead(
      new Types.ObjectId(data.dialogId),
      new Types.ObjectId(client.data.user.id),
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

    this.ensureOnlineSubscriptions(fromUser.id, [data.to]);
    this.ensureOnlineSubscriptions(data.to, [fromUser.id]);
  }

  // ========== ПОЛЬЗОВАТЕЛИ ==========
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
