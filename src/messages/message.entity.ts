// src/messages/message.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { Order } from '../orders/orders.entity';
import { Product } from '../products/products.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sender_id' })
  senderId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  // 🔥 ADD THIS: Link directly to the Admin/Seller ID
  @Column({ nullable: true })
  sellerId: number; 

  @Column()
  sellerName: string; // Keep this for display purposes

  @Column('text')
  content: string;

  @Column()
  orderId: number;

  @Column()
  productId: number;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ default: false })
  isFromSeller: boolean;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}