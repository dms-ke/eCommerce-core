// src/auth/interfaces/jwt-payload.interface.ts

export interface JwtPayload {
  // 'sub' is the standard JWT subject claim, often used for the User ID
  sub: number; 

  // Include any other properties you are encoding in your token 
  username: string; 
  // role: string; 
}