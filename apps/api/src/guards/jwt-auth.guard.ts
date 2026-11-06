// TV3 — Guard JWT dùng chung. TV4/TV5/TV6 gắn @UseGuards(JwtAuthGuard) lên route cần đăng nhập, rồi lấy user bằng @CurrentUser().
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { AuthService } from "../services/auth.service.js";
import type { AuthenticatedUser } from "../types/auth.types.js";
// Chỉ khai báo phần request mà guard cần, tránh phụ thuộc kiểu của express.
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}
export function extractBearerToken(
  header: string | string[] | undefined,
): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    // verifyAccessToken ném 401 với mã TOKEN_MISSING / TOKEN_INVALID / TOKEN_EXPIRED.
    request.user = this.auth.verifyAccessToken(token ?? "");
    return true;
  }
}
