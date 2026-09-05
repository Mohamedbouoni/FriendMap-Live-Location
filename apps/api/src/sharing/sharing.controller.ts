import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SharingService } from './sharing.service';
import { UpdateSharingModeDto } from './dto/update-mode.dto';
import { UpdateExceptionsDto } from './dto/update-exceptions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('sharing')
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Get('settings')
  async getSettings(@CurrentUser('sub') userId: string) {
    return this.sharingService.getSharingSettings(userId);
  }

  @Patch('mode')
  async updateMode(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSharingModeDto,
  ) {
    return this.sharingService.updateMode(userId, dto.mode);
  }

  @Patch('exceptions')
  async updateExceptions(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateExceptionsDto,
  ) {
    return this.sharingService.updateExceptions(userId, dto.exceptions);
  }
}
