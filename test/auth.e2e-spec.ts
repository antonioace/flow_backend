import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { EmailService } from './../src/email/email.service';
import { UsersService } from './../src/users/users.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const emailService = { sendEmail: jest.fn() };
  let usersService: UsersService;
  const testEmail = 'test@example.com';
  const testPassword = 'password123';
  const newPassword = 'newPassword456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );

    await app.init();
    usersService = app.get<UsersService>(UsersService);

    // Clean up test user if exists
    const existingUser = await usersService.findByEmail(testEmail);
    if (existingUser) {
      await usersService.remove(existingUser.id);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/register (POST)', async () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        name: 'Test User',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('user');
        expect(res.body).toHaveProperty('access_token');
      });
  });

  it('/auth/login (POST)', async () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('access_token');
      });
  });

  it('/auth/forgot-password (POST)', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: testEmail })
      .expect(201);

    expect(emailService.sendEmail).toHaveBeenCalled();
  });

  it('/auth/reset-password (POST)', async () => {
    // Get the user to find the token
    const user = await usersService.findByEmail(testEmail);
    expect(user).toBeDefined();
    if (!user) throw new Error('User not found'); // Guard for TS

    const resetToken = user.resetPasswordToken;
    expect(resetToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: resetToken,
        newPassword: newPassword,
      })
      .expect(201);

    // Verify login with new password
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: newPassword,
      })
      .expect(201);
  });
});
