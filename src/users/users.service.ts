import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const password = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      ...dto,
      password,
      role: dto.role ?? 'user',
      isActive: dto.isActive ?? true,
    });
    return this.usersRepository.save(user);
  }

  static sanitize(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      profile: user.profile,
    };
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: ['id', 'email', 'name', 'profile'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const payload: Partial<User> = { ...dto };
    if (dto.password) {
      payload.password = await bcrypt.hash(dto.password, 10);
    }
    Object.assign(user, payload);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  async setResetToken(id: string, token: string, expires: Date): Promise<void> {
    await this.usersRepository.update(id, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { resetPasswordToken: token },
    });
  }

  async clearResetToken(id: string): Promise<void> {
    await this.usersRepository.update(id, {
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
    });
  }
}
