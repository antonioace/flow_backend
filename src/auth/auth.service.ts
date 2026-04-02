import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new BadRequestException('Credenciales inválidas');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new BadRequestException('Credenciales inválidas');
    }
    return user;
  }

  async login(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async register(dto: RegisterDto) {
    const user = await this.usersService.create({
      ...dto,
      role: 'user',
      isActive: true,
    });
    const token = await this.login({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { user, ...token };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Email not found');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // 1 hour expiration

    await this.usersService.setResetToken(user.id, code, expires);

    await this.emailService.sendEmail(
      user.email,
      'Recuperación de contraseña',
      `Tu código de recuperación es: ${code}`,
    );

    return { message: 'Password reset email sent' };
  }

  async resetPassword(code: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(code);
    if (!user) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Token expired');
    }

    await this.usersService.update(user.id, { password: newPassword });
    await this.usersService.clearResetToken(user.id);

    return { message: 'Password reset successfully' };
  }

  async verifyToken(token: string) {
    const payload: unknown = await this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>('JWT_SECRET') as string,
    });
    if (!payload) {
      throw new BadRequestException('Invalid or expired token');
    }
    return { valid: true };
  }
}
