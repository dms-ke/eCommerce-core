import { Module } from '@nestjs/common';
import { ChatsGateway } from './chats.gateway';

@Module({
  providers: [ChatsGateway],
  exports: [ChatsGateway], // 👈 CRITICAL: This allows MessagesModule to "see" the gateway
})
export class ChatsModule {}