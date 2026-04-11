import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Order } from '../orders/orders.entity'; 
// 🔥 NEW: Import the Address entity
import { Address } from '../addresses/address.entity'; 

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ default: 'customer' })
  role: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  // Add these to your existing User entity class:

  @Column({ type: 'varchar', nullable: true })
  resetPasswordToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires: Date | null;

  // Relationship with Orders
  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  // 🔥 NEW: Relationship with Addresses (One User has Many Addresses)
  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];
}