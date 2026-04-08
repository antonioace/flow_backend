import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { ChatService } from './chat.service';
import { PayloadRoom } from './gateways/chat.gateway';
interface ConnectedClient {
  [id: string]: {
    socket: Socket;
    user: Partial<User>;
  };
}
@Injectable()
export class ChatWssService {
  private readonly logger = new Logger(ChatWssService.name);
  private connectedClients: ConnectedClient = {};
  private rooms: Map<string, Set<string>> = new Map();
  constructor(
    private readonly chatService: ChatService,
    private readonly usersService: UsersService,
  ) {}

  async registerClient(client: Socket, user: Partial<JwtPayload>) {
    if (!user.sub) {
      throw new Error('Invalid user');
    }
    const userFound = await this.usersService.findOne(user.sub);
    if (!userFound) {
      throw new Error('User not found');
    }
    this.checkConnection(userFound);

    this.connectedClients[client.id] = {
      socket: client,
      user: userFound,
    };
  }

  removeClient(client: Socket) {
    delete this.connectedClients[client.id];
  }

  checkConnection(user: Partial<User>) {
    for (const clientId of Object.keys(this.connectedClients)) {
      const connectedClient = this.connectedClients[clientId];
      if (connectedClient.user.id === user.id) {
        connectedClient.socket.disconnect();
        break;
      }
    }
  }
  getRoomUsers(roomId: string) {
    return this.rooms.get(roomId) || [];
  }

  joinUserToRoom(userId: string, roomId: string) {
    if (!this.rooms.get(roomId)) {
      this.rooms.set(roomId, new Set<string>());
    }
    this.rooms.get(roomId)?.add(userId);
  }

  removeUserFromRoom(userId: string, roomId: string) {
    this.rooms.get(roomId)?.delete(userId);
  }

  getUserByIdClient(userId: string): Partial<User> | null {
    for (const clientId of Object.keys(this.connectedClients)) {
      const connectedClient = this.connectedClients[clientId];
      if (connectedClient.user.id === userId) {
        return connectedClient.user;
      }
    }
    return null;
  }
  sendMessage(payload: PayloadRoom) {
    if (payload.message) {
      this.chatService
        .saveMessage(payload.userId, {
          conversationId: payload.roomId,
          content: payload.message,
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Error saving message to DB: ${errMsg}`);
        });
    }
  }
}
