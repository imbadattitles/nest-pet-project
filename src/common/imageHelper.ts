import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import path, { extname, join } from 'path';
import * as fs from 'fs';
// Функция для генерации имени файла
export const editFileName = (req, file, callback) => {
  const name = file.originalname.split('.')[0];
  const fileExtName = extname(file.originalname);
  const randomName = Array(4)
    .fill(null)
    .map(() => Math.round(Math.random() * 16).toString(16))
    .join('');
  callback(null, `${name}-${randomName}${fileExtName}`);
};

// Фильтр для изображений
export const imageFileFilter = (req, file, callback) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
    return callback(
      new BadRequestException('Only image files are allowed!'),
      false,
    );
  }
  callback(null, true);
};

export interface FileTypeConfig {
  type: 'image' | 'video' | 'audio' | 'document';
  allowedExtensions: string[];
  maxSize: number;
  folder: string;
}

export const defaultFileTypes: FileTypeConfig[] = [
  {
    type: 'image',
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    maxSize: 5 * 1024 * 1024, // 5MB
    folder: 'images',
  },
  {
    type: 'video',
    allowedExtensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
    maxSize: 100 * 1024 * 1024, // 100MB
    folder: 'videos',
  },
  {
    type: 'audio',
    allowedExtensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
    maxSize: 20 * 1024 * 1024, // 20MB
    folder: 'audios',
  },
  {
    type: 'document',
    allowedExtensions: [
      'pdf',
      'doc',
      'docx',
      'txt',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'rtf',
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    folder: 'documents',
  },
];

export const createUploadConfig = (
  moduleName: string,
  customTypes?: FileTypeConfig[],
) => {
  const fileTypes = customTypes || defaultFileTypes;

  const typeMap = new Map<string, FileTypeConfig>();
  fileTypes.forEach((type) => {
    type.allowedExtensions.forEach((ext) => {
      typeMap.set(ext, type);
    });
  });

  const getDestination = (
    req: any,
    file: Express.Multer.File,
    callback: any,
  ) => {
    const ext = extname(file.originalname).toLowerCase().substring(1);
    const fileType = typeMap.get(ext);

    if (!fileType) {
      return callback(
        new BadRequestException(`File type .${ext} is not supported`),
        null,
      );
    }

    // Просто возвращаем строку с прямыми слешами
    const destination = `./uploads/${moduleName}/${fileType.folder}`;

    // Создаём директорию
    const fullPath = destination.replace(/\//g, path.sep);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    console.log(destination);

    callback(null, destination); // Возвращаем ./uploads/messages/images
  };

  const editFileName = (req: any, file: Express.Multer.File, callback: any) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    callback(null, `${uniqueSuffix}${ext}`);
  };

  const fileFilter = (req: any, file: Express.Multer.File, callback: any) => {
    const ext = extname(file.originalname).toLowerCase().substring(1);
    const fileType = typeMap.get(ext);

    if (fileType) {
      if (!req.fileTypes) req.fileTypes = [];
      req.fileTypes.push({
        fieldname: file.fieldname,
        type: fileType.type,
        extension: ext,
      });
      callback(null, true);
    } else {
      callback(
        new BadRequestException(`File type .${ext} is not supported`),
        false,
      );
    }
  };

  return {
    storage: diskStorage({
      destination: getDestination,
      filename: editFileName,
    }),
    fileFilter,
    limits: {
      fileSize: Math.max(...fileTypes.map((t) => t.maxSize)),
    },
  };
};
