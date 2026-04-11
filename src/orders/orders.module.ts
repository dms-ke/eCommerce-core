// src/orders/orders.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { WebhookController } from './webhook.controller';
import { OrdersService } from './orders.service';
import { Order } from './orders.entity';
import { OrderItem } from './order-item.entity';
import { ProductsModule } from '../products/products.module';
import { MpesaModule } from '../mpesa/mpesa.module'; 
import { SmsModule } from '../sms/sms.module'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]), 
    ProductsModule,
    MpesaModule, 
    SmsModule, 
  ],
  controllers: [OrdersController, WebhookController],
  providers: [OrdersService],
  exports: [OrdersService], // 🔥 ADDED: This allows PaymentsModule to inject OrdersService!
})
export class OrdersModule {}