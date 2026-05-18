import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Backend API' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Main backend service' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'ENG',
    description: 'Short uppercase prefix for ticket IDs e.g. ENG-1, ENG-2',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(5)
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Identifier must be uppercase letters and numbers only',
  })
  identifier: string;
}

