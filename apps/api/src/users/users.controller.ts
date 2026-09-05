import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: JwtUser) {
    return this.usersService.getProfile(user.sub);
  }

  @Get('search')
  async searchUsers(
    @Query('q') query: string,
    @CurrentUser('sub') currentUserId: string,
  ) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.usersService.searchUsers(query, currentUserId);
  }
}
