import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../user/user.entity'; // Adjust this path if your User entity is elsewhere

@Entity()
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column()
  phoneNumber: string;

  @Column()
  streetAddress: string;

  @Column()
  city: string;

  @Column({ default: false })
  isDefault: boolean;

  // Many addresses can belong to one User
  @ManyToOne(() => User, user => user.addresses, { onDelete: 'CASCADE' })
  user: User;
}