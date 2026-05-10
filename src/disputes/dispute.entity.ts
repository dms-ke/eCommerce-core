// src/disputes/dispute.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @Column()
  productId: number;

  @Column()
  customerId: number;

  // Add this inside dispute.entity.ts
  @Column()
  sellerId: number;

  @Column()
  customerName: string;

  @Column()
  productName: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column('text')
  reason: string;

  @Column('simple-array', { nullable: true })
  photos: string[]; // Stores an array of image URLs

  @Column({ default: 'OPEN' }) 
  status: string; // 'OPEN', 'RESOLVED', 'ESCALATED'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}