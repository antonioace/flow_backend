import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { NotificationsService } from './notifications.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  create(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateNotificationDto,
  ) {
    return this.notificationsService.create(req.user.userId, dto);
  }

  @Get()
  findAll(
    @Request() req: { user: { userId: string } },
    @Query() paginationDto: PaginationDto,
  ) {
    return this.notificationsService.findAllByUser(
      req.user.userId,
      paginationDto,
    );
  }

  @Sse('sse')
  sse(@Request() req: { user: { userId: string } }): Observable<MessageEvent> {
    return this.notificationsService.getEventStream(req.user.userId);
  }

  @Get(':id')
  findOne(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.notificationsService.findOne(req.user.userId, id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(req.user.userId, id, dto);
  }

  @Patch(':id/read')
  markAsRead(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(req.user.userId, id);
  }

  @Delete(':id')
  remove(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.notificationsService.remove(req.user.userId, id);
  }
}
