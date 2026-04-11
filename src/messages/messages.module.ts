import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { Message } from './message.entity';
import { ChatsModule } from '../chats/chats.module'; // Ensure path is correct

@Module({
  imports: [
    TypeOrmModule.forFeature([Message]),
    ChatsModule, // Enables dependency injection of ChatsGateway into MessagesService
  ],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService], // Export if other modules need to send messages
})
export class MessagesModule {}