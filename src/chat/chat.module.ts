import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { User } from 'src/users/entities/user.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatWssService } from './chat.wss.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ChatGatewayService } from './gateways/chat.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, User]),
    AuthModule,
  ],
  controllers: [ChatController],
  providers: [ChatGatewayService, ChatWssService, ChatService],
  exports: [ChatService],
})
export class ChatModule {}
