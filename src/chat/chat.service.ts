import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Crea una nueva conversación uno-a-uno o devuelve una existente.
   */
  async createConversation(userId: string, dto: CreateConversationDto) {
    const { name, description } = dto;
    let { recipientId } = dto;

    if (!recipientId) {
      const admin = await this.userRepo.findOne({ where: { role: 'admin' } });
      if (!admin) {
        throw new NotFoundException(
          'No hay administradores disponibles para soporte.',
        );
      }
      recipientId = admin.id;
    }

    if (userId === recipientId) {
      throw new BadRequestException('No puedes chatear contigo mismo.');
    }

    const participants = [userId, recipientId];

    const participantUsers = await this.userRepo.find({
      where: { id: In(participants) },
    });

    if (participantUsers.length !== 2) {
      throw new BadRequestException('El destinatario no existe.');
    }

    const conversation = this.conversationRepo.create({
      participants: participantUsers,
      name,
      description,
    });

    return this.conversationRepo.save(conversation);
  }

  /**
   * Obtiene todas las conversaciones del usuario.
   */
  async getConversations(userId: string) {
    return this.conversationRepo
      .createQueryBuilder('conversation')
      .innerJoin('conversation.participants', 'participant')
      .leftJoinAndSelect('conversation.participants', 'all_participants')
      .where('participant.id = :userId', { userId })
      .orderBy('conversation.updatedAt', 'DESC')
      .getMany();
  }

  /**
   * Obtiene una conversación por ID si el usuario es participante.
   */
  async getConversationById(userId: string, id: string) {
    const conversation = await this.conversationRepo.findOne({
      where: { id },
      relations: ['participants'],
    });

    if (!conversation)
      throw new NotFoundException('Conversación no encontrada.');

    const isParticipant = conversation.participants.some(
      (p) => p.id === userId,
    );
    if (!isParticipant) throw new BadRequestException('No eres participante.');

    return conversation;
  }

  /**
   * Guarda un mensaje en la base de datos.
   */
  async saveMessage(userId: string, dto: SendMessageDto) {
    const { conversationId, content } = dto;

    const conversation = await this.getConversationById(userId, conversationId);
    const sender = await this.userRepo.findOneBy({ id: userId });

    if (!sender) throw new NotFoundException('Usuario no encontrado.');

    const message = this.messageRepo.create({
      content,
      conversation,
      sender,
    });

    const saved = await this.messageRepo.save(message);

    // Actualizar el timestamp de la conversación
    await this.conversationRepo.save(conversation);

    return saved;
  }

  /**
   * Obtiene el historial de mensajes de una conversación.
   */
  async getMessages(userId: string, conversationId: string) {
    await this.getConversationById(userId, conversationId);

    return this.messageRepo.find({
      where: { conversation: { id: conversationId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      take: 50,
    });
  }

  /**
   * Elimina una conversación y todos sus mensajes (vía CASCADE).
   */
  async deleteConversation(userId: string, id: string) {
    const conversation = await this.getConversationById(userId, id);
    await this.conversationRepo.remove(conversation);
    return { success: true };
  }
}
