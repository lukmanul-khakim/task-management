import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@prisma/client';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
} 
from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateTicketDto {
  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({
    example: '2026-12-31',
    nullable: true,
    description: 'Pass null to remove due date',
  })
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : value))
  dueDate?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'User ID to assign, or null to unassign',
  })
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : value))
  assigneeId?: string | null;
}

