// src/products/products.entity.ts

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  OneToMany, 
  CreateDateColumn, 
  UpdateDateColumn,
  DeleteDateColumn 
} from 'typeorm';
import { Review } from './review.entity'; 

// 🔥 NEW: This forces TypeORM to return decimals as actual numbers in your API 
// instead of returning them as strings, preventing frontend math errors!
export class ColumnNumericTransformer {
  to(data: number): number {
    return data;
  }
  from(data: string): number {
    return parseFloat(data);
  }
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('decimal', { 
    precision: 10, 
    scale: 2,
    transformer: new ColumnNumericTransformer() // 🔥 Added Transformer
  })
  price: number;

  @Column('int', { default: 0 })
  discountPercentage: number;

  @Column('int')
  stock: number;

  @Column({ default: 'Nairobi, Kenya' })
  shippingOrigin: string;

  @Column('decimal', { 
    precision: 10, 
    scale: 2, 
    default: 250,
    transformer: new ColumnNumericTransformer() // 🔥 Added Transformer
  })
  deliveryFee: number;

  @Column({ default: '1-3 Days' })
  estimatedDelivery: string;

  @Column({ nullable: true })
  photoUrl: string;

  @Column('simple-array', { nullable: true })
  gallery: string[];
  
  @Column({ default: 'Brand New' })
  condition: string;

  @Column({ default: 'Official Tech Store' })
  sellerName: string;

  @OneToMany(() => Review, (review) => review.product)
  reviews: Review[];

  // This automatically sets the date/time when you create the product
  @CreateDateColumn()
  createdAt: Date;

  // This automatically updates the date/time whenever you edit the product
  @UpdateDateColumn()
  updatedAt: Date;

  // 🔥 ENTERPRISE STANDARD: Soft Delete Tracking
  // TypeORM will automatically populate this column when you call .softRemove()
  // and hide the product from all standard queries.
  @DeleteDateColumn()
  deletedAt?: Date;
}