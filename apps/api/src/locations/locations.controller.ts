import { Controller, Post, Get, Body } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { PublishLocationDto } from './dto/publish-location.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post('update')
  async updateLocation(
    @CurrentUser('sub') userId: string,
    @Body() dto: PublishLocationDto,
  ) {
    return this.locationsService.processLocationUpdate(userId, dto);
  }

  @Get('history')
  async getHistory(@CurrentUser('sub') userId: string) {
    return this.locationsService.getUserHistory(userId);
  }
}
