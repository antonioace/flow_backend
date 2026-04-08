import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Crea o devuelve una conversación existente.
   */
  @Post('conversations')
  async createConversation(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(req.user.userId, dto);
  }

  /**
   * Lista todas las conversaciones del usuario.
   */
  @Get('conversations')
  async getConversations(@Request() req: { user: { userId: string } }) {
    return this.chatService.getConversations(req.user.userId);
  }

  /**
   * Detalles de una conversación.
   */
  @Get('conversations/:id')
  async getConversationById(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.chatService.getConversationById(req.user.userId, id);
  }

  /**
   * Envía y persiste un mensaje.
   */
  @Post('messages')
  async sendMessage(
    @Request() req: { user: { userId: string } },
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.saveMessage(req.user.userId, dto);
  }

  /**
   * Historial de mensajes de una conversación.
   */
  @Get('messages/:conversationId')
  async getMessages(
    @Request() req: { user: { userId: string } },
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.getMessages(req.user.userId, conversationId);
  }
}
