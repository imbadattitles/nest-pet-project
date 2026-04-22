import { Post } from '../schemas/post.schema';
import { Comment } from '../../comments/schemas/comment.schema';
import { User } from '../../users/schemas/user.schema';

// Интерфейс для автора
export interface IAuthor {
  _id: string;
  username: string;
  email: string;
  avatar?: string;
}

// Интерфейс для комментария с populate
export interface ICommentWithAuthor extends Omit<Comment, 'author'> {
  author: IAuthor;
  replies?: ICommentWithAuthor[];
}

// Интерфейс для поста с комментариями
export interface IPostWithComments extends Omit<Post, 'author'> {
  author: IAuthor;
  comments: {
    comments: ICommentWithAuthor[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

// Интерфейс для ответа API
export interface IApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  statusCode: number;
}
