import { IsUUID, IsBoolean, IsNumber, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimeRangeDto {
  @ApiProperty({ description: 'Channel UUID' })
  @IsUUID()
  channel_id: string;

  @ApiProperty({ description: 'Has time data' })
  @IsBoolean()
  has_time: boolean;

  @ApiPropertyOptional({ description: 'Minimum timestamp' })
  @IsOptional()
  @IsNumber()
  min_timestamp?: number;

  @ApiPropertyOptional({ description: 'Maximum timestamp' })
  @IsOptional()
  @IsNumber()
  max_timestamp?: number;

  @ApiPropertyOptional({ description: 'Minimum ISO timestamp' })
  @IsOptional()
  @IsString()
  min_iso?: string;

  @ApiPropertyOptional({ description: 'Maximum ISO timestamp' })
  @IsOptional()
  @IsString()
  max_iso?: string;

  @ApiPropertyOptional({ description: 'Minimum index' })
  @IsOptional()
  @IsNumber()
  min_index?: number;

  @ApiPropertyOptional({ description: 'Maximum index' })
  @IsOptional()
  @IsNumber()
  max_index?: number;

  @ApiProperty({ description: 'Total number of points' })
  @IsNumber()
  total_points: number;
}