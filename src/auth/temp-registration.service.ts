import { Injectable } from '@nestjs/common';
import { RedisService } from '../globalServices/redis.service';

@Injectable()
export class TempRegistrationService {
  constructor(private redisService: RedisService) {}

  async save(userId: string, data: any) {
    await this.redisService.set(`temp_reg:${userId}`, data, 15 * 60); // 15 минут
  }

  async get(userId: string) {
    return this.redisService.get(`temp_reg:${userId}`);
  }
  async delete(userId: string) {
    await this.redisService.del(`temp_reg:${userId}`);
  }
}