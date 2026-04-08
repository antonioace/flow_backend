import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { ChatWssService } from '../chat.wss.service';

export interface PayloadRoom {
  roomId: string;
  userId: string;
  message?: string;
}
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGatewayService
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly chatWssService: ChatWssService,
  ) {}
  private logger: Logger = new Logger('ChatGateway');
  async handleConnection(client: Socket) {
    console.log('TE INTENTAS CONETAR HIJO DEPUTA');
    try {
      const token = client.handshake.headers?.authorization;
      if (!token) {
        client.disconnect();
        return;
      }

      const result = await this.authService.verifyToken(token);
      const user = result?.user;

      if (!user) {
        client.disconnect();
        return;
      }

      await this.chatWssService.registerClient(client, user);
      this.logger.log(`Client connected: ${client.id}`);
    } catch (error: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Connection failed: ${error?.message}`);
      client.disconnect();
    }
  }
  @SubscribeMessage('room:join')
  handleRoomJoin(client: Socket, payload: PayloadRoom): void {
    try {
      void client.join(payload.roomId);
      this.chatWssService.joinUserToRoom(payload.userId, payload.roomId);
      client.emit('room:joined', {
        roomId: payload.roomId,
        userId: payload.userId,
        message: 'You have joined the room',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error joining room: ${message}`);
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('room:leave')
  handleRoomLeave(client: Socket, payload: PayloadRoom): void {
    try {
      void client.leave(payload.roomId);
      this.chatWssService.removeUserFromRoom(payload.userId, payload.roomId);
      client.emit('room:left', {
        roomId: payload.roomId,
        userId: payload.userId,
        message: 'You have left the room',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error leaving room: ${message}`);
      client.emit('error', { message: 'Failed to leave room' });
    }
  }

  @SubscribeMessage('message:send')
  handleMessageSend(client: Socket, payload: PayloadRoom): void {
    try {
      this.chatWssService.sendMessage(payload);
      this.server.to(payload.roomId).emit('message:received', {
        roomId: payload.roomId,
        userId: payload.userId,
        message: payload.message,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending message: ${message}`);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  afterInit(_: Server) {
    this.logger.log('Init');
  }

  handleDisconnect(client: Socket) {
    this.chatWssService.removeClient(client);
  }
}
