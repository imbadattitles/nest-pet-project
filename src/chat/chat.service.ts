import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Dialog, DialogDocument } from './schemas/dialog.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import {CreateGroupDto} from './dto/create-group.dto';
import { AppGateway } from 'src/gateway/app.gateway';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Dialog.name) private dialogModel: Model<DialogDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway
  ) {}

  async createPrivateChat(userId1: Types.ObjectId, userId2: Types.ObjectId): Promise<DialogDocument> {
    let dialog = await this.dialogModel.findOne({
      type: 'private',
      participants: { $all: [userId1, userId2], $size: 2 }
    });

    if (!dialog) {
      dialog = new this.dialogModel({
        type: 'private',
        participants: [userId1, userId2],
        unreadCount: new Map([
          [userId1.toString(), 0],
          [userId2.toString(), 0]
        ])
      });
      await dialog.save();
    }

    return dialog.populate('participants', 'username avatar online lastSeen');
  }

  async createGroupChat(creatorId: Types.ObjectId, dto: CreateGroupDto): Promise<DialogDocument> {
    const participants = [creatorId, ...(dto.participants || [])];
    
    const dialog = new this.dialogModel({
      type: 'group',
      groupName: dto.groupName,
      groupAvatar: dto.groupAvatar,
      groupDescription: dto.groupDescription,
      participants,
      admins: [creatorId],
      createdBy: creatorId,
      unreadCount: new Map(participants.map(p => [p.toString(), 0])),
      userSettings: new Map(participants.map(p => [p.toString(), {
        muted: false,
        pinned: false,
        joinedAt: new Date()
      }]))
    });

    await dialog.save();
    
    await this.sendSystemMessage(
      dialog._id,
      creatorId,
      `Создана группа "${dto.groupName}"`
    );
    
    return dialog.populate('participants', 'username avatar');
  }

  async sendMessage(senderId: Types.ObjectId, dto: CreateMessageDto): Promise<MessageDocument> {
    const dialog = await this.dialogModel.findById(dto.dialogId)
      .populate('participants');
    
    if (!dialog) {
      throw new NotFoundException('Conversation not found');
    }
    
    if (!dialog.participants.some(p => p._id.toString() === senderId.toString())) {
      throw new ForbiddenException('Not a participant');
    }
    
    // Определяем получателей
    let receiverId: Types.ObjectId | null = null;
    let pendingFor: Types.ObjectId[] = [];
    
    if (dialog.type === 'private') {
  const otherParticipant = dialog.participants.find(
    p => p._id.toString() !== senderId.toString()
  );
  
  // Безопасная проверка
  if (!otherParticipant) {
    throw new Error('Participant not found in private dialog');
  }
  
  receiverId = otherParticipant._id;
  pendingFor = [receiverId];
    }
    
    const message = new this.messageModel({
      dialogId: dialog._id,
      senderId,
      receiverId,
      text: dto.text,
      attachments: dto.attachments,
      mentions: dto.mentions,
      pendingFor,
      readBy: [{ userId: senderId }],
      deliveredTo: [senderId]
    });
    
    await message.save();
    

    // Обновляем диалог
    dialog.lastMessage = message._id;
    dialog.lastMessageSender = senderId;
    
    for (const participant of dialog.participants) {
      const userId = participant._id.toString();
      if (userId !== senderId.toString()) {
        const currentCount = dialog.unreadCount.get(userId) || 0;
        dialog.unreadCount.set(userId, currentCount + 1);
      }
    }
    
    await dialog.save();

    const mes = await message.populate('sender', 'username avatar')
    const dial = await dialog.populate('lastMessage')
    await this.appGateway.sendMessageToDialog(dialog._id.toString(), mes, dial);
    
    return mes
  }

  async markAsRead(dialogId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
    const dialog = await this.dialogModel.findById(dialogId);
    if (!dialog) {
        throw new NotFoundException('Dialog not found');
    }
    const message = await this.messageModel.findOne({ dialogId })
      .sort({ createdAt: -1 });
    
    if (message) {
      const alreadyRead = message.readBy.some(r => r.userId.toString() === userId.toString());
      if (!alreadyRead) {
        message.readBy.push({ userId, readAt: new Date() });
        await message.save();
      }
      
      if (message.pendingFor.includes(userId)) {
        message.pendingFor = message.pendingFor.filter(
          id => id.toString() !== userId.toString()
        );
        await message.save();
      }
    }
    
    dialog.unreadCount.set(userId.toString(), 0);
    await dialog.save();
  }

  async getMessages(
    dialogId: Types.ObjectId, 
    userId: Types.ObjectId, 
    limit = 50, 
    before?: Date
  ): Promise<MessageDocument[]> {
    const dialog = await this.dialogModel.findById(dialogId);
    if (!dialog) {
        throw new NotFoundException('Dialog not found');
    }
    if (!dialog.participants.includes(userId)) {
        throw new ForbiddenException('Access denied');
    }
    
    const query: any = { 
      dialogId, 
      isDeleted: false,
      deletedBy: { $ne: userId }
    };
    
    if (before) {
      query.createdAt = { $lt: before };
    }
    
    const messages = await this.messageModel.find(query)
      .populate('sender', 'username avatar')
      .populate('replyTo')
      .populate('mentions', 'username')
      .sort({ createdAt: -1 })
      .limit(limit);
    
    return messages.reverse();
  }

  async getUserDialogs(userId: string): Promise<any[]> {
    const dialogs = await this.dialogModel.find({
      participants: userId,
      isActive: true
    })
    .populate('participants', 'username avatar online lastSeen')
    .populate('lastMessage')
    .sort({ lastMessageTime: -1 }).exec();
    console.log(dialogs)
    return dialogs.map(conv => {
      const otherUser = conv.type === 'private' 
        ? conv.participants.find(p => p._id.toString() !== userId.toString())
        : null;
      
      return {
        _id: conv._id,
        type: conv.type,
        groupName: conv.groupName,
        groupAvatar: conv.groupAvatar,
        withUser: otherUser,
        participants:  conv.participants ,
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount.get(userId.toString()) || 0,
        updatedAt: conv.updatedAt
      };
    });
  }

  async getDialogById(dialogId: Types.ObjectId, userId: Types.ObjectId): Promise<DialogDocument> {
    // console.log('Getting dialog by ID:', dialogId, 'for user:', userId);
    const dialog = await this.dialogModel.findById(dialogId)
      .populate('participants', 'username avatar online lastSeen')
      .populate('lastMessage');
    // console.log('Found dialog:', dialog);
    if (!dialog) {
      throw new NotFoundException('Dialog not found');
    }

    // Проверяем, является ли пользователь участником диалога
    const userObjectId = new Types.ObjectId(userId);
    const isParticipant = dialog.participants.some(p => 
      Types.ObjectId.isValid(p._id) && new Types.ObjectId(p._id).equals(userObjectId)
    );
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }
    
    return dialog;
  }

  private async sendSystemMessage(
    dialogId: Types.ObjectId, 
    senderId: Types.ObjectId, 
    text: string
  ): Promise<MessageDocument> {
    const message = new this.messageModel({
      dialogId,
      senderId,
      text: `📢 ${text}`,
      isSystem: true
    });
    
    return message.save();
  }
}