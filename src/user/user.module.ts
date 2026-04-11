// src/user/user.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller'; // 🔥 NEW: Import the controller

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController], // 🔥 NEW: Register the controller here
  providers: [UserService], 
  exports: [UserService], 
})
export class UserModule {}