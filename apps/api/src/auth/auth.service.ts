import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, username: string, password: string) {
    // Check for existing user
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === email ? 'Email already registered' : 'Username already taken',
      );
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    // Create user with default GHOST sharing settings
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        sharingSettings: {
          create: { mode: 'GHOST' },
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });

    this.logger.log(`User registered: ${username} (${email})`);

    // Generate JWT
    const accessToken = this.generateToken(user.id, user.email, user.username);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  async login(identifier: string, password: string) {
    // Find user by email or username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.username}`);

    // Generate JWT
    const accessToken = this.generateToken(user.id, user.email, user.username);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  private generateToken(userId: string, email: string, username: string): string {
    return this.jwt.sign({
      sub: userId,
      email,
      username,
    });
  }
}
