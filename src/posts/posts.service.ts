import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
  ) {}

  async create(createPostDto: CreatePostDto, authorId: string): Promise<PostDocument> {
    const post = new this.postModel({
      ...createPostDto,
      author: new Types.ObjectId(authorId),
    });
    return post.save();
  }

  async findAll(page = 1, limit = 10, search?: string, authorId?: string) {
    const skip = (page - 1) * limit;

    const query: any = {};

    if (search) {
      query.$text = { $search: search };
    }

    if (authorId && Types.ObjectId.isValid(authorId)) {
      query.author = new Types.ObjectId(authorId);
    }

    const [posts, total] = await Promise.all([
      this.postModel
        .find(query)
        .populate('author', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.postModel.countDocuments(query),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Неверный формат ID поста');
    }

    const post = await this.postModel
      .findById(id)
      .populate('author', 'username email')
      .exec();

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    return post;
  }

  async update(id: string, updatePostDto: UpdatePostDto, userId: string): Promise<PostDocument> {
    const post = await this.findOne(id);

    if (post.author._id.toString() !== userId) {
      throw new ForbiddenException('Нет прав для редактирования этого поста');
    }

    Object.assign(post, updatePostDto);
    return post.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const post = await this.findOne(id);

    if (post.author._id.toString() !== userId) {
      throw new ForbiddenException('Нет прав для удаления этого поста');
    }

    await post.deleteOne();
  }

  async findByAuthor(authorId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.postModel
        .find({ author: new Types.ObjectId(authorId) })
        .populate('author', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.postModel.countDocuments({ author: new Types.ObjectId(authorId) }),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
  async findByUserId(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
  
    const [posts, total] = await Promise.all([
      this.postModel
        .find({ author: new Types.ObjectId(userId) })
        .populate('author', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.postModel.countDocuments({ author: new Types.ObjectId(userId) }),
    ]);
  
    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}