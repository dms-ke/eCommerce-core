// src/cart/cart-item.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Cart } from './cart.entity';
import { Product } from '../products/products.entity';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  quantity: number;

  // Many items can belong to one cart
  @ManyToOne(() => Cart, cart => cart.items, { onDelete: 'CASCADE' })
  cart: Cart;

  // Many cart items can point to the same product catalog entry
  @ManyToOne(() => Product)
  product: Product;
}