// C:\Users\Lenovo\ecommerce-core\src\auth\auth.module.ts

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy'; 

import { UserModule } from '../user/user.module'; 

@Module({
  imports: [
    PassportModule, 
    JwtModule.register({
      secret: 'YOUR_SECRET_KEY', 
      signOptions: { expiresIn: '1h' },
    }),
    UserModule, 
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy, // <- Defined here
  ],
  exports: [
    AuthService, 
    JwtModule, 
    JwtStrategy, // <-- ADDED THIS: Makes the 'jwt' strategy available to OrdersModule
  ]
})
export class AuthModule {}