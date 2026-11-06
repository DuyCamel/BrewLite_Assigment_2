// TV3 — Lấy user đã xác thực trong controller: `getMine(@CurrentUser() user: AuthenticatedUser)`. Chỉ dùng cùng JwtAuthGuard.
import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../types/auth.types.js";
import type { AuthenticatedRequest } from "./jwt-auth.guard.js";
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user)
      throw new UnauthorizedException({
        statusCode: 401,
        code: "TOKEN_MISSING",
        message: "Cần đăng nhập để tiếp tục.",
      });
    return request.user;
  },
);
