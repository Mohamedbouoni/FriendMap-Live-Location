import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  identifier!: string; // email or username

  @IsString()
  @MinLength(1)
  password!: string;
}
