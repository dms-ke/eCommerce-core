// src/cart/cart.entity.ts

import { Entity, PrimaryGeneratedColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from '../user/user.entity'; // ⚠️ Update this path if your User entity is elsewhere (e.g., '../users/user.entity')
import { CartItem } from './cart-item.entity';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn()
  id: number;

  // A cart belongs to exactly one user
  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  // A cart can have many items inside it
  @OneToMany(() => CartItem, cartItem => cartItem.cart, { cascade: true })
  items: CartItem[];
}