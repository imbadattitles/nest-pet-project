import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Dialog, DialogDocument } from './schemas/dialog.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { AppGateway } from 'src/gateway/app.gateway';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Dialog.name) private dialogModel: Model<DialogDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway,
  ) {}

  async createPrivateChat(
    userId1: Types.ObjectId,
    userId2: Types.ObjectId,
  ): Promise<DialogDocument> {
    let dialog = await this.dialogModel.findOne({
      type: 'private',
      participants: { $all: [userId1, userId2], $size: 2 },
    });

    if (!dialog) {
      dialog = new this.dialogModel({
        type: 'private',
        participants: [userId1, userId2],
        unreadCount: new Map([
          [userId1.toString(), 0],
          [userId2.toString(), 0],
        ]),
        usersStatus: new Map([
          [
            userId1.toString(),
            {
              dialogDelete: false,
              notifications: true,
            },
          ],
          [
            userId2.toString(),
            {
              dialogDelete: false,
              notifications: true,
            },
          ],
        ]),
      });
      await dialog.save();
    }

    return dialog.populate('participants', 'username avatar online lastSeen');
  }

  async createGroupChat(
    creatorId: Types.ObjectId,
    dto: CreateGroupDto,
  ): Promise<DialogDocument> {
    const participants = [creatorId, ...(dto.participants || [])];

    const dialog = new this.dialogModel({
      type: 'group',
      groupName: dto.groupName,
      groupAvatar: dto.groupAvatar,
      groupDescription: dto.groupDescription,
      participants,
      admins: [creatorId],
      createdBy: creatorId,
      unreadCount: new Map(participants.map((p) => [p.toString(), 0])),
      userSettings: new Map(
        participants.map((p) => [
          p.toString(),
          {
            muted: false,
            pinned: false,
            joinedAt: new Date(),
          },
        ]),
      ),
    });

    await dialog.save();

    await this.sendSystemMessage(
      dialog._id,
      creatorId,
      `Создана группа "${dto.groupName}"`,
    );

    return dialog.populate('participants', 'username avatar');
  }

  private async updateMessagesDeletionStatusDialogId(
    dialogId: Types.ObjectId,
    userIds: Types.ObjectId[],
    actingUserId: Types.ObjectId,
  ): Promise<void> {
    const setDeleteObject: any = {};
    userIds.forEach((userId) => {
      setDeleteObject[`isDeleted.${userId.toString()}`] = true;
    });

    await this.messageModel.updateMany(
      { dialogId },
      {
        $set: setDeleteObject,
        $addToSet: {
          deletedBy: actingUserId,
        },
      },
    );
  }

  async deleteDialogAll(
    dialogId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<any> {
    const dialog = await this.dialogModel.findById(dialogId);
    if (!dialog) return;

    dialog.participants.forEach((participant) => {
      const userStatus = dialog.usersStatus.get(participant.toString());
      dialog.usersStatus.set(participant.toString(), {
        notifications: userStatus?.notifications ?? false,
        dialogDelete: true,
      });
    });
    await dialog.save();

    await this.updateMessagesDeletionStatusDialogId(
      dialogId,
      dialog.participants,
      userId,
    );

    await this.appGateway.dialogDeleted(
      dialogId.toString(),
      dialog.participants,
    );
    return {
      success: true,
    };
  }

  async deleteMessage(
    messageId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    const message = await this.messageModel.findById(messageId);
    if (!message) return;

    await this.messageModel.updateOne(
      { _id: messageId },
      {
        $set: { [`isDeleted.${userId.toString()}`]: true },
        $addToSet: { deletedBy: userId },
      },
    );
  }

  async deleteMessagesArrayForAll(
    dialogId: Types.ObjectId,
    messageIds: Types.ObjectId[],
    actingUserId: Types.ObjectId,
  ): Promise<any> {
    const dialog = await this.dialogModel.findById(dialogId);
    if (!dialog) return;
    await this.markArrayMessageAsDeleted(
      messageIds,
      dialog.participants,
      actingUserId,
    );
    await this.appGateway.messagesDeleted(dialogId.toString(), messageIds);
    return {
      success: true,
    };
  }

  async deleteMessagesArrayForMe(
    dialogId: Types.ObjectId,
    messageIds: Types.ObjectId[],
    actingUserId: Types.ObjectId,
  ): Promise<any> {
    const dialog = await this.dialogModel.findById(dialogId);
    if (!dialog) return;
    await this.markArrayMessageAsDeleted(
      messageIds,
      [actingUserId],
      actingUserId,
    );
    return {
      success: true,
    };
  }

  private async markArrayMessageAsDeleted(
    messageIds: Types.ObjectId[],
    userIds: Types.ObjectId[],
    actingUserId: Types.ObjectId,
  ): Promise<void> {
    const setDeleteObject: any = {};
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    userIds.forEach((userId) => {
      setDeleteObject[`isDeleted.${userId.toString()}`] = true;
    });

    await this.messageModel.updateMany(
      { _id: { $in: ids } }, // ← все сообщения из массива
      {
        $set: setDeleteObject,
        $addToSet: { deletedBy: actingUserId },
      },
    );
  }

  async deleteDialogOne(
    dialogId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    const dialog = await this.dialogModel.findById(dialogId);
    if (dialog) {
      const currentStatus = dialog.usersStatus.get(userId.toString());
      dialog?.usersStatus.set(userId.toString(), {
        notifications: currentStatus?.notifications ?? false,
        dialogDelete: true,
      });
      await dialog.save();
    }

    await this.messageModel.updateMany(
      { dialogId },
      {
        $set: {
          [`isDeleted.${userId.toString()}`]: true,
        },
        $addToSet: {
          deletedBy: userId,
        },
      },
    );
    await this.appGateway.dialogDeleted(dialogId.toString(), [userId]);
  }

  async sendMessage(
    senderId: Types.ObjectId,
    dto: CreateMessageDto,
  ): Promise<MessageDocument> {
    const dialog = await this.dialogModel
      .findById(dto.dialogId)
      .populate('participants');

    if (!dialog) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      !dialog.participants.some((p) => p._id.toString() === senderId.toString())
    ) {
      throw new ForbiddenException('Not a participant');
    }

    let receiverId: Types.ObjectId | null = null;
    let pendingFor: Types.ObjectId[] = [];

    if (dialog.type === 'private') {
      const otherParticipant = dialog.participants.find(
        (p) => p._id.toString() !== senderId.toString(),
      );

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
      deliveredTo: [senderId],
    });

    await message.save();

    for (const participant of dialog.participants) {
      const userId = participant._id.toString();
      if (userId !== senderId.toString()) {
        const currentCount = dialog.unreadCount.get(userId) || 0;
        dialog.unreadCount.set(userId, currentCount + 1);
      }
    }

    await dialog.save();

    const mes = await message.populate('sender', 'username avatar');
    await this.appGateway.sendMessageToDialog(
      dialog._id.toString(),
      mes,
      dialog,
    );

    return mes;
  }

  async markSingleMessageAsRead(
    messageId: Types.ObjectId,
    dialogId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    try {
      const result = await this.messageModel.updateOne(
        {
          _id: messageId,
          'readBy.userId': { $ne: userId },
        },
        {
          $push: { readBy: { userId, readAt: new Date() } },
          $pull: { pendingFor: userId },
        },
      );
      await this.appGateway.messageAsRead(
        dialogId.toString(),
        messageId,
        userId,
      );

      const unreadCount = await this.messageModel.countDocuments({
        dialogId: dialogId,
        'readBy.userId': { $ne: userId },
        pendingFor: userId,
      });

      await this.dialogModel.updateOne(
        { _id: dialogId },
        { $set: { [`unreadCount.${userId}`]: unreadCount } },
      );
    } catch (error) {
      console.log(error);
    }
  }
  async getMessages(
    dialogId: Types.ObjectId,
    userId: Types.ObjectId,
    limit = 50,
    before?: Date,
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
      [`isDeleted.${userId}`]: { $ne: true },
    };

    if (before) {
      query.createdAt = { $lt: before };
    }

    const messages = await this.messageModel
      .find(query)
      .populate('sender', 'username avatar')
      .populate('replyTo')
      .populate('mentions', 'username')
      .sort({ createdAt: -1 })
      .limit(limit);

    return messages.reverse();
  }

  async getUserDialogs(userId: string): Promise<any[]> {
    const dialogs = await this.dialogModel
      .find({
        participants: userId,
        isActive: true,
        [`usersStatus.${userId}.dialogDelete`]: false,
      })
      .populate('participants', 'username avatar online lastSeen')
      .exec();

    // Ждём выполнения всех промисов
    const result = await Promise.all(
      dialogs.map(async (conv) => {
        const otherUser =
          conv.type === 'private'
            ? conv.participants.find(
                (p) => p._id.toString() !== userId.toString(),
              )
            : null;

        const lastMessage = await this.messageModel
          .findOne({
            dialogId: conv._id,
            [`isDeleted.${userId}`]: { $ne: true },
          })
          .populate('sender', 'username avatar')
          .populate('replyTo')
          .populate('mentions', 'username')
          .exec();
        console.log('lastMessage', lastMessage);

        return {
          _id: conv._id,
          type: conv.type,
          groupName: conv.groupName,
          groupAvatar: conv.groupAvatar,
          withUser: otherUser,
          participants: conv.participants,
          unreadCount: conv.unreadCount.get(userId.toString()) || 0,
          updatedAt: conv.updatedAt,
          lastMessage,
        };
      }),
    );

    return result;
  }

  async getDialogById(
    dialogId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<DialogDocument & { unreadCount: number }> {
    // console.log('Getting dialog by ID:', dialogId, 'for user:', userId);
    const dialog = await this.dialogModel
      .findById({
        _id: dialogId,
        [`usersStatus.${userId}.dialogDelete`]: false,
      })
      .populate('participants', 'username avatar online lastSeen');
    if (!dialog) {
      throw new NotFoundException('Dialog not found');
    }

    // Проверяем, является ли пользователь участником диалога
    const userObjectId = new Types.ObjectId(userId);
    const isParticipant = dialog.participants.some(
      (p) =>
        Types.ObjectId.isValid(p._id) &&
        new Types.ObjectId(p._id).equals(userObjectId),
    );
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    return {
      ...dialog.toObject(),
      unreadCount: dialog.unreadCount.get(userId.toString()) || 0,
    } as DialogDocument & { unreadCount: number };
  }

  private async sendSystemMessage(
    dialogId: Types.ObjectId,
    senderId: Types.ObjectId,
    text: string,
  ): Promise<MessageDocument> {
    const message = new this.messageModel({
      dialogId,
      senderId,
      text: `📢 ${text}`,
      isSystem: true,
    });

    return message.save();
  }
}
