import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class SeedService {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async run() {
    const userEmail = 'antonioacevedocastellanos@gmail.com';

    let user = await this.usersService.findByEmail(userEmail);
    if (!user) {
      user = await this.usersService.create({
        email: userEmail,
        name: 'Antonio Acevedo',
        password: '123123123',
        role: 'user',
        isActive: true,
      });
    }

    await this.notificationsService.create(user.id, {
      title: 'Bienvenido',
      message: 'Tu cuenta fue creada exitosamente.',
    });

    return { userId: user.id };
  }
}
