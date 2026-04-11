import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ProductsService } from './products.service'; 
import { ProductsController } from './products.controller';
import { ProductsGateway } from './products.gateway';
import { SearchModule } from '../search/search.module';
import { Product } from './products.entity'; 
import { Review } from './review.entity'; // Import the new entity

@Module({
  imports: [
    // Registers both Product and Review entities for DB persistence
    TypeOrmModule.forFeature([Product, Review]), 
    SearchModule,
    CacheModule.register({ 
      ttl: 60, 
      max: 10, 
    }), 
  ], 
  controllers: [ProductsController],
  providers: [
    ProductsService, 
    ProductsGateway, 
  ],
  exports: [
    ProductsService, 
    ProductsGateway, 
    TypeOrmModule, 
  ]
})
export class ProductsModule {}