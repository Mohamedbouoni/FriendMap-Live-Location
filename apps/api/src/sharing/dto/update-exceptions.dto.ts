import { IsArray, ValidateNested, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SharingExceptionType } from '@friendmap/contracts';

export class ExceptionItemDto {
  @IsString()
  friendId!: string;

  @IsEnum(SharingExceptionType)
  type!: SharingExceptionType;
}

export class UpdateExceptionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExceptionItemDto)
  exceptions!: ExceptionItemDto[];
}
