import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ChatSendDto {
  @IsUUID('4')
  @IsNotEmpty()
  recipientId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;

  @IsOptional()
  @IsString()
  clientMessageId?: string;
}

export class ChatHistoryDto {
  @IsUUID('4')
  @IsNotEmpty()
  friendId!: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  limit?: number;
}

export class ChatReadDto {
  @IsUUID('4')
  @IsNotEmpty()
  friendId!: string;

  @IsString()
  @IsNotEmpty()
  lastReadMessageId!: string;
}

export class ChatDeleteDto {
  @IsUUID('4')
  @IsNotEmpty()
  messageId!: string;
}
