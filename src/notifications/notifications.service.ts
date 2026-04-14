import { Injectable, MessageEvent, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, interval, merge, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification } from './entities/notification.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationResult } from '../common/interfaces/pagination-result.interface';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateNotificationDto) {
    const notification = this.notificationsRepository.create({
      ...dto,
      userId,
      readAt: null,
    });
    const saved = await this.notificationsRepository.save(notification);
    this.eventEmitter.emit('notification.created', saved);
    return saved;
  }

  getEventStream(userId: string): Observable<MessageEvent> {
    const notifications$ = fromEvent(
      this.eventEmitter,
      'notification.created',
    ).pipe(
      filter((notification: Notification) => notification.userId === userId),
      map(
        (notification: Notification) =>
          ({
            data: notification,
            type: 'notification-created',
          }) as MessageEvent,
      ),
    );

    // Heartbeat cada 30s para mantener la conexión viva
    const heartbeat$ = interval(30000).pipe(
      map(
        () =>
          ({ data: { type: 'heartbeat' }, type: 'heartbeat' }) as MessageEvent,
      ),
    );

    return merge(notifications$, heartbeat$);
  }

  async findAllByUser(
    userId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<Notification>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [data, total] = await this.notificationsRepository.findAndCount({
      where: { userId },
      take: limit,
      skip,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        limit,
      },
    };
  }

  async findOne(userId: string, id: string) {
    const notification = await this.notificationsRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }
    return notification;
  }

  async update(userId: string, id: string, dto: UpdateNotificationDto) {
    const notification = await this.findOne(userId, id);
    Object.assign(notification, dto);
    return this.notificationsRepository.save(notification);
  }

  async remove(userId: string, id: string) {
    const result = await this.notificationsRepository.delete({ id, userId });
    if (!result.affected) {
      throw new NotFoundException('Notificación no encontrada');
    }
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.findOne(userId, id);
    notification.readAt = new Date();
    return this.notificationsRepository.save(notification);
  }
}
