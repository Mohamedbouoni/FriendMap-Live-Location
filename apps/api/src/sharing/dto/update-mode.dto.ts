import { IsEnum } from 'class-validator';
import { SharingMode } from '@friendmap/contracts';

export class UpdateSharingModeDto {
  @IsEnum(SharingMode)
  mode!: SharingMode;
}
