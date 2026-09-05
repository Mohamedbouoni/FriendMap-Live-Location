import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async searchUsers(query: string, currentUserId: string) {
    const cleanQuery = query.trim().toLowerCase();

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { email: { contains: cleanQuery, mode: 'insensitive' } },
          { username: { contains: cleanQuery, mode: 'insensitive' } },
        ],
      },
      take: 20,
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });

    return users.map((u: any) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    }));
  }
}
