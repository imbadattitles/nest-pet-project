import { AppGateway } from './../gateway/app.gateway';
import { CurrentUser } from './../common/decorators/current-user.decorator';
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private AppGateway: AppGateway
  ) {}

  async create(createUserDto: { email: string; username: string; password: string }): Promise<UserDocument> {
    // Проверяем, не существует ли пользователь
    const existingUser = await this.userModel.findOne({
      $or: [{ email: createUserDto.email }, { username: createUserDto.username }],
    });

    if (existingUser) {
      const field = existingUser.email === createUserDto.email ? 'Email' : 'Username';
      throw new ConflictException(`${field} already exists`);
    }

    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findMyProfile(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+contacts').populate('contacts').exec();
  }

  async getMyContacts(currentUser: any): Promise<{ success: boolean; data: string[]; message: string }> {
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

  async addContact(currentUser:{ id: string }, data: { userId: string }): Promise<{ success: boolean; data: string[]; message: string }> {
    const user = await this.findMyProfile(currentUser.id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    console.log(user)
    if (!user.contacts.includes(data.userId)) {
      user.contacts.push(data.userId);
      this.AppGateway.sendNotification(data.userId, `У вас новый подписчик: ${currentUser.id}`);
      await user.save();
    }

    return {
      success: true,
      data: user.contacts,
      message: 'Контакт добавлен',
    };
  }

  async removeContact(currentUser:{ id: string }, data: { userId: string }): Promise<{ success: boolean; data: string[]; message: string }> {
    const user = await this.findMyProfile(currentUser.id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    console.log(user)
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

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password').exec();
  }

  async update(id: string, updateData: Partial<User>): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-password')
      .exec();
  }

  async remove(id: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  async validateUser(email: string, password: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email }).select('+password');

    if (user && (await (user as any).comparePassword(password))) {
      return user;
    }
    return null;
  }
}