import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
// Make sure this path correctly points to your decorator file!
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Check if the route has any required roles attached to it
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    // If no specific roles are required, let them through
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 2. Security Check: Is there a user attached to the request?
    // (This requires a JwtAuthGuard to run BEFORE this RolesGuard)
    if (!user) {
      throw new UnauthorizedException('You must be logged in to access this resource.');
    }

    // 3. Role Check: Does the user have the required role?
    // This checks if it's an exact string match OR if it's an array of roles
    const hasRole = requiredRoles.some((role) => user.role === role || user.role?.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Admin access required. You do not have permission.');
    }

    return true;
  }
}