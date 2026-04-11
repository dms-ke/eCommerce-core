import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Product } from './products.entity';
import { User } from '../user/user.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  rating: number; // 1 to 5

  @Column({ type: 'text', nullable: true })
  comment: string;

  // 🔥 ADDED: Stores the custom name, defaults to 'Anonymous' if left blank
  @Column({ default: 'Anonymous' })
  reviewerName: string;

  // 🔥 FIXED: Renamed from 'sellerReply' to 'reply' to match the ProductsService perfectly!
  @Column({ type: 'text', nullable: true })
  reply: string;

  @ManyToOne(() => Product, (product) => product.id)
  product: Product;

  @ManyToOne(() => User, (user) => user.id)
  user: User;
}