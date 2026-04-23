import { ChangePasswordDto } from './dto/change-password.dto';
import { AppGateway } from './../gateway/app.gateway';
import { CurrentUser } from './../common/decorators/current-user.decorator';
import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import {
  RecoveryException,
  ValidationException,
} from 'src/common/expections/custom-exceptions';
import { ErrorCode } from 'src/common/expections/error-codes';
import { TempResetService } from 'src/auth/temp-reset.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private AppGateway: AppGateway,
    private tempResetService: TempResetService,
  ) {}
  private readonly logger = new Logger(UsersService.name);
  async create(createUserDto: {
    email: string;
    username: string;
    password: string;
  }): Promise<UserDocument> {
    // Проверяем, не существует ли пользователь
    const existingUser = await this.userModel.findOne({
      $or: [
        { email: createUserDto.email },
        { username: createUserDto.username },
      ],
    });

    if (existingUser) {
      const field =
        existingUser.email === createUserDto.email ? 'Email' : 'Username';
      throw new ConflictException(`${field} already exists`);
    }

    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findById(
    id: string,
    exec: boolean = true,
  ): Promise<UserDocument | null> {
    if (exec) {
      return this.userModel.findById(id).exec();
    } else {
      return this.userModel.findById(id);
    }
  }

  async findMyProfile(
    id: string,
    withLean: boolean = true,
  ): Promise<UserDocument | null> {
    if (withLean) {
      return this.userModel
        .findById(id)
        .select('+contacts')
        .populate('contacts')
        .lean()
        .exec();
    } else {
      return this.userModel
        .findById(id)
        .select('+contacts')
        .populate('contacts')
        .exec();
    }
  }

  async getMyContacts(
    currentUser: any,
  ): Promise<{ success: boolean; data: string[]; message: string }> {
    const user = await this.findById(currentUser.id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return {
      success: true,
      data: user.contacts, // Возвращаем только список контактов
      message: 'контакты получены',
    };
  }

  async toggleContact(
    currentUser: { id: string },
    data: { userId: string },
  ): Promise<{ success: boolean; data: string[]; message: string }> {
    // Получаем пользователя БЕЗ populate (contacts как простой массив строк)
    const user = await this.userModel
      .findById(currentUser.id)
      .select('+contacts');
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const contactId = data.userId;
    const isContactExists = user.contacts.includes(contactId);

    if (isContactExists) {
      // Удаляем контакт
      user.contacts = user.contacts.filter((id) => id !== contactId);
      await user.save();
      return {
        success: true,
        data: user.contacts,
        message: 'Контакт удалён',
      };
    } else {
      // Добавляем контакт
      user.contacts.push(contactId);
      await user.save();
      // Уведомляем другого пользователя (если нужно)
      this.AppGateway.sendNotification(
        contactId,
        `Пользователь ${currentUser.id} добавил вас в контакты.`,
      );
      return {
        success: true,
        data: user.contacts,
        message: 'Контакт добавлен',
      };
    }
  }

  async removeContact(
    currentUser: { id: string },
    data: { userId: string },
  ): Promise<{ success: boolean; data: string[]; message: string }> {
    const user = await this.findMyProfile(currentUser.id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    // console.log(user)
    if (user.contacts.includes(data.userId)) {
      user.contacts = user.contacts.filter((id: string) => id !== data.userId);
      await user.save();
    }

    return {
      success: true,
      data: user.contacts,
      message: 'Контакт удален',
    };
  }

  async findByString(string: string): Promise<UserDocument[] | null> {
    const regex = new RegExp(string, 'i'); // 'i' = case-insensitive
    return this.userModel
      .find({
        $or: [{ username: regex }, { email: regex }],
      })
      .exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password').exec();
  }

  async update(
    id: string,
    updateData: Partial<User>,
  ): Promise<UserDocument | null> {
    if (updateData.password) {
      throw new ValidationException(
        ErrorCode.GO_FUCK_YOURSELF,
        'GO_FUCK_YOURSELF',
      );
    }

    if (updateData.nickname) {
      const existingNickname = await this.userModel.findOne({
        nickname: updateData.nickname,
      });
      if (existingNickname) {
        throw new ConflictException(
          'Пользователь с таким nickname уже существует',
        );
      }
    }

    return this.userModel
      .findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .select('-password')
      .exec();
  }

  async remove(id: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email }).select('+password');

    if (user && (await (user as any).comparePassword(password))) {
      return user;
    }
    return null;
  }

  async changePassword(ChangePasswordDto: ChangePasswordDto): Promise<void> {
    if (ChangePasswordDto.from === 'reset') {
      if (!ChangePasswordDto.tempUserId) {
        throw new ValidationException(
          ErrorCode.VALIDATION_TEMP_USER_ID_REQUIRED,
          'Reset ID is required',
        );
      }
      const tempData = await this.tempResetService.get(
        ChangePasswordDto.tempUserId,
      );

      if (!tempData) {
        this.logger.warn(
          `Verification failed: temp data not found for ${ChangePasswordDto.tempUserId}`,
        );
        throw new RecoveryException(
          ErrorCode.PASSWORD_RESET_DATA_NOT_FOUND,
          'Reset data not found or expired. ',
        );
      }
      const userId = tempData.userId;
      await this.userModel.findByIdAndUpdate(userId, {
        password: ChangePasswordDto.password,
      });
      await this.tempResetService.delete(ChangePasswordDto.tempUserId);
    }
  }

  async toggleSavePost(
    userId: string,
    postId: string,
  ): Promise<{ saved: boolean }> {
    const user = await this.userModel.findById(userId).select('savedPosts');
    const postObjectId = new Types.ObjectId(postId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isSaved = user.savedPosts.some((id) => id.equals(postObjectId));

    if (isSaved) {
      await this.userModel.updateOne(
        { _id: userId },
        { $pull: { savedPosts: postObjectId } },
      );
    } else {
      await this.userModel.updateOne(
        { _id: userId },
        { $addToSet: { savedPosts: postObjectId } },
      );
    }
    return { saved: !isSaved };
  }
}
