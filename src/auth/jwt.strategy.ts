import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // 1. Extract the token from the standard Bearer header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      
      // 2. Ensure expired tokens are rejected
      ignoreExpiration: false,
      
      // 3. THIS MUST MATCH THE SECRET IN YOUR AUTH.MODULE.TS
      secretOrKey: 'YOUR_SECRET_KEY', 
    });
  }

  // This method runs after the token is verified.
  // The return value is injected into request.user
  async validate(payload: any) {
    return { 
      id: payload.sub,      // <--- CHANGED: Renamed 'userId' to 'id'
      username: payload.email, 
      role: payload.role 
    };
  }
}