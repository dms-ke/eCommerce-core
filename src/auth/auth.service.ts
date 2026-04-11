// src/auth/auth.service.ts

import { Injectable, UnauthorizedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  // Registration Logic
  async register(email: string, pass: string, role: string = 'user'): Promise<{ user: any }> {
    const existingUser = await this.userService.findOneByEmail(email);
    
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    
    const user = await this.userService.create(email, pass, role);
    const { password_hash, ...result } = user; 
    return { user: result };
  }

  // Login Logic
  async login(email: string, pass: string): Promise<{ access_token: string }> {
    const user = await this.userService.findOneByEmail(email);

    if (!user || !(await bcrypt.compare(pass, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  // Forgot Password Logic
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userService.findOneByEmail(email);
    if (!user) {
      return { message: 'If an account with that email exists, a reset link has been sent.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); 
    
    await this.userService.save(user); 

    const transporter = nodemailer.createTransport({
      service: 'gmail', 
      auth: {
        user: 'mutisodaniel69@gmail.com',
        pass: 'mcul roqy duws vmea', 
      },
    });

    const resetUrl = `http://localhost:3001/reset-password?token=${resetToken}`;

    try {
      await transporter.sendMail({
        from: '"Official Tech Store" <mutisodaniel69@gmail.com>',
        to: user.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset</h2>
          <p>You requested to reset your password. Click the link below to set a new one:</p>
          <a href="${resetUrl}" style="padding: 10px 20px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Reset Password</a>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">This link will expire in 15 minutes. If you did not request this, please ignore this email.</p>
        `,
      });

      return { message: 'If an account with that email exists, a reset link has been sent.' };
    } catch (error) {
      console.error('Error sending email:', error);
      
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await this.userService.save(user);

      throw new InternalServerErrorException('There was an error sending the reset email. Please try again later.');
    }
  }

  // 🔥 NEW: Actually reset the password
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // 1. Find the user by the token
    const user = await this.userService.findOneByResetToken(token);

    // 2. If no user is found, the token is fake or already used
    if (!user) {
      throw new UnauthorizedException('Invalid or expired password reset token.');
    }

    // 3. Check if the token has expired (past the 15 minutes we set)
    // 3. Check if the token has expired OR if the expiration date is somehow missing
    if (!user.resetPasswordExpires || new Date() > user.resetPasswordExpires) {
      // Clean up the expired token
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await this.userService.save(user);
      
      throw new UnauthorizedException('Invalid or expired password reset token.');
    }

    // 4. Hash the new password securely
    user.password_hash = await bcrypt.hash(newPassword, 10);

    // 5. Clear the reset tokens so this link can never be used again
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    // 6. Save the updated user to the database
    await this.userService.save(user);

    return { message: 'Password successfully reset' };
  }
}