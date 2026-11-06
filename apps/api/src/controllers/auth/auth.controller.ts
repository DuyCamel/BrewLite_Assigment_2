import { AUTH_ROUTES } from "../../routes/auth.routes.js";
// TV3 — POST /auth/register, POST /auth/login, GET /auth/me. Controller chỉ nhận request và gọi service, không chứa nghiệp vụ.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../guards/current-user.decorator.js";
import { JwtAuthGuard } from "../../guards/jwt-auth.guard.js";
import { AuthService } from "../../services/auth.service.js";
import { PasswordResetService } from "../../services/password-reset.service.js";
import { UsersService } from "../../services/users.service.js";
import type { AuthenticatedUser } from "../../types/auth.types.js";
@Controller(AUTH_ROUTES.base)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PasswordResetService)
    private readonly passwordReset: PasswordResetService,
  ) {}
  @Post(AUTH_ROUTES.register)
  async register(@Body() body: unknown) {
    return { user: await this.auth.register(body) };
  }
  @Post(AUTH_ROUTES.login)
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.auth.login(body);
  }
  // Luôn trả 200 và cùng một thông báo dù email có tồn tại hay không.
  @Post(AUTH_ROUTES.forgotPassword)
  @HttpCode(200)
  forgotPassword(@Body() body: unknown) {
    return this.passwordReset.requestReset(body);
  }
  @Post(AUTH_ROUTES.resetPassword)
  @HttpCode(200)
  resetPassword(@Body() body: unknown) {
    return this.passwordReset.resetPassword(body);
  }
  @Get(AUTH_ROUTES.me)
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { user: await this.users.getCurrentUser(user.id) };
  }
}
