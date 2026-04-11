// src/payments/payments.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayoutCronService } from './payout.cron';
import { Transaction } from './transaction.entity';

// 🔥 ADDED: Import the OrdersModule
import { OrdersModule } from '../orders/orders.module'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    OrdersModule, // 🔥 ADDED: Bring the OrdersModule into the PaymentsModule
  ], 
  controllers: [PaymentsController],
  providers: [PaymentsService, PayoutCronService],
  exports: [PaymentsService], 
})
export class PaymentsModule {}