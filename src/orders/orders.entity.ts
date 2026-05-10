import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from '../user/user.entity'; 
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderDate: Date;

  // 🔥 ADDED: Frontend expects this exact field for dates and sorting
  @CreateDateColumn()
  createdAt: Date;

  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ default: 'PENDING' })
  status: string;

  // 🔥 For Escrow Disputes
  @Column({ type: 'text', nullable: true })
  disputeReason: string;
  
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  shippingFee: number;

  @Column({ default: 'MPESA' })
  paymentMethod: string;

  // 🔥 ADDED: Who is delivering this order? (VENDOR or PLATFORM)
  @Column({ default: 'VENDOR' }) 
  deliveryMethod: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ type: 'json', nullable: true })
  shippingAddress: any;
}