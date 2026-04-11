// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // 🔥 1. Import this
import { CacheModule } from '@nestjs/cache-manager'; 
import * as redisStore from 'cache-manager-redis-store'; 
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices'; 
import { ServeStaticModule } from '@nestjs/serve-static'; 
import { ScheduleModule } from '@nestjs/schedule'; // 🔥 NEW: Required for Cron Jobs
import { join } from 'path'; 

import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { SearchModule } from './search/search.module';
import { OrdersModule } from './orders/orders.module';
import { CartModule } from './cart/cart.module';
import { MpesaModule } from './mpesa/mpesa.module';
import { AddressesModule } from './addresses/addresses.module';
import { MessagesModule } from './messages/messages.module';
import { PaymentsModule } from './payments/payments.module'; // 🔥 NEW: Imported Payments Module

@Module({
  imports: [
    // 🔥 FIX: This MUST be here for NestJS to read your .env file!
    ConfigModule.forRoot({
      isGlobal: true, 
    }),

    // 1. Database Configuration
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost', 
      port: 5432,
      username: 'postgres', 
      password: 'Mutiso488@@@', // You can also move this to your .env later!
      database: 'ecommerce_db', 
      entities: [__dirname + '/**/*.entity{.ts,.js}'], 
      synchronize: true, 
    }),

    // Serve Static Files (like our uploaded images)
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'), 
      serveRoot: '/uploads', 
    }),

    // 2. Define the Redis Client for the AI Service 
    ClientsModule.register([
      {
        name: 'AI_SERVICE_REDIS', 
        transport: Transport.REDIS,
        options: {
          host: 'localhost', 
          port: 6379,
        },
      },
    ]),

    // 3. Configure the Caching Layer using Redis
    CacheModule.register({
      isGlobal: true, 
      store: redisStore,
      host: 'localhost', 
      port: 6379, 
      ttl: 60, 
    }),

    // 🔥 NEW: Turn on the Cron Job Scheduler
    ScheduleModule.forRoot(),

    UserModule,
    AuthModule,
    ProductsModule,
    SearchModule,
    OrdersModule,
    CartModule,
    MpesaModule,
    AddressesModule,
    MessagesModule,
    PaymentsModule,
  ],
})
export class AppModule {}