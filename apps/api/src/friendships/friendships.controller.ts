import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FriendshipsService } from './friendships.service';
import { SendFriendRequestDto } from './dto/send-request.dto';
import { RespondFriendRequestDto } from './dto/respond-request.dto';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@Controller('friendships')
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  @Get()
  async getFriendships(@CurrentUser('sub') currentUserId: string) {
    return this.friendshipsService.getFriendships(currentUserId);
  }

  @Post('request')
  async sendRequest(
    @CurrentUser('sub') currentUserId: string,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendshipsService.sendRequest(currentUserId, dto.identifier);
  }

  @Patch(':id/respond')
  async respondToRequest(
    @Param('id') id: string,
    @CurrentUser('sub') currentUserId: string,
    @Body() dto: RespondFriendRequestDto,
  ) {
    return this.friendshipsService.respondToRequest(id, currentUserId, dto.accept);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async removeFriendship(
    @Param('id') id: string,
    @CurrentUser('sub') currentUserId: string,
  ) {
    return this.friendshipsService.removeFriendship(id, currentUserId);
  }
}
