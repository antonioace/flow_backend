import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { WorkspaceAction } from './interfaces/workspaces-action.interface';

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Ejecuta una acción individual (send_notification o send_email).
   */
  async executeAction(
    action: WorkspaceAction,
    recordData: Record<string, unknown>,
  ) {
    switch (action.actionType) {
      case 'send_notification':
        await this.executeSendNotification(action, recordData);
        break;
      case 'send_email':
        await this.executeSendEmail(action, recordData);
        break;
      default:
        this.logger.warn(
          `Tipo de acción desconocido: ${action?.actionType as string}`,
        );
    }
  }

  /**
   * Ejecuta la acción de enviar notificación.
   */
  private async executeSendNotification(
    action: WorkspaceAction,
    recordData: Record<string, unknown>,
  ) {
    const config = action.notificationConfig;
    if (!config) {
      this.logger.warn(
        `Acción "${action.name}" no tiene notificationConfig configurado.`,
      );
      return;
    }

    const title = this.resolveDynamicValue(config.title, recordData);
    const content = this.resolveDynamicValue(config.content, recordData);

    // Resolver el valor original del destinatario (puede ser ID o Email)
    let recipientValue: string | undefined;
    if (config.isRecipientDynamic && config.recipientEmail) {
      recipientValue = this.resolveDynamicValue(
        config.recipientEmail,
        recordData,
      );
    } else {
      recipientValue = config.recipientEmail;
    }

    if (!recipientValue) {
      this.logger.warn(
        `Acción "${action.name}": no se pudo resolver el destinatario para la notificación.`,
      );
      return;
    }

    // Buscar al usuario real
    const user = await this.getRecipientUser(recipientValue);
    if (!user) {
      this.logger.warn(
        `Acción "${action.name}": no se encontró usuario para "${recipientValue}".`,
      );
      return;
    }

    this.logger.log(
      `Enviando notificación "${title}" al usuario "${user.id}" (${user.email})`,
    );

    await this.notificationsService.create(user.id, {
      title,
      message: content,
    });

    this.logger.log(
      `Notificación "${title}" enviada exitosamente al usuario "${user.id}".`,
    );
  }

  /**
   * Ejecuta la acción de enviar email.
   */
  private async executeSendEmail(
    action: WorkspaceAction,
    recordData: Record<string, unknown>,
  ) {
    const config = action.emailConfig;
    if (!config) {
      this.logger.warn(
        `Acción "${action.name}" no tiene emailConfig configurado.`,
      );
      return;
    }

    const subject = this.resolveDynamicValue(config.subject, recordData);
    const content = this.resolveDynamicValue(config.content, recordData);

    // Resolver el valor del destinatario
    let recipientValue: string | undefined;
    if (config.isRecipientDynamic && config.recipientEmail) {
      recipientValue = this.resolveDynamicValue(
        config.recipientEmail,
        recordData,
      );
    } else {
      recipientValue = config.recipientEmail;
    }

    if (!recipientValue) {
      this.logger.warn(
        `Acción "${action.name}": no se pudo resolver el email del destinatario.`,
      );
      return;
    }

    // Si el valor es un ID, buscamos el email del usuario. Si ya es un email, lo usamos.
    let finalEmail = recipientValue;
    const user = await this.getRecipientUser(recipientValue);
    if (user) {
      finalEmail = user.email;
    }

    // Verificación básica de formato de email
    if (!finalEmail || !finalEmail.includes('@')) {
      this.logger.warn(
        `Acción "${action.name}": el destinatario "${finalEmail}" no es un email válido.`,
      );
      return;
    }

    this.logger.log(`Enviando email "${subject}" a "${finalEmail}"`);

    await this.emailService.sendEmail(finalEmail, subject, content);

    this.logger.log(
      `Email "${subject}" enviado exitosamente a "${finalEmail}".`,
    );
  }

  /**
   * Intenta encontrar un usuario basándose en un valor que puede ser ID o Email.
   */
  private async getRecipientUser(value: string): Promise<User | null> {
    if (!value) return null;

    // Si parece un email, buscamos por email primero
    if (value.includes('@')) {
      const user = await this.usersService.findByEmail(value);
      if (user) return user;
    }

    // Intentamos buscar por ID
    try {
      return await this.usersService.findOne(value);
    } catch {
      return null;
    }
  }

  /**
   * Resuelve un valor dinámico.
   * Si el valor empieza con "campo_", extrae el nombre del campo
   * y busca su valor en la data del record.
   * Si no empieza con "campo_", retorna el valor tal cual.
   */
  resolveDynamicValue(
    value: string,
    recordData: Record<string, unknown>,
  ): string {
    if (typeof value === 'string' && value.startsWith('campo_')) {
      const fieldPath = value.replace('campo_', '');

      // Intentamos resolver el valor (soportando niveles anidados con puntos)
      const resolved = fieldPath
        .split('.')
        .reduce((obj: unknown, key: string) => {
          if (obj && typeof obj === 'object') {
            return (obj as Record<string, unknown>)[key];
          }
          return undefined;
        }, recordData);

      if (resolved === undefined || resolved === null) {
        this.logger.warn(
          `Campo dinámico "${fieldPath}" no encontrado en la data del record.`,
        );
        return '';
      }

      // Manejo seguro para evitar "[object Object]"
      if (typeof resolved === 'object') {
        if (resolved instanceof Date) {
          return resolved.toLocaleString();
        }

        try {
          return JSON.stringify(resolved);
        } catch {
          return '[Objeto Complejo]';
        }
      }

      // En este punto, resolved es un primitivo (string, number, boolean)
      return String(resolved as string | number | boolean);
    }

    return value;
  }
}
