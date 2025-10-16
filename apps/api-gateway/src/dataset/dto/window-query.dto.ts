import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DownsamplingMethod } from '../enums/downsampling-method.enum';

export class WindowQueryDto {
  @ApiProperty({ description: 'UUID du canal' })
  @IsUUID()
  channel_id: string;

  @ApiPropertyOptional({ description: 'ISO date si has_time' })
  @IsOptional()
  @IsString()
  start?: string;

  @ApiPropertyOptional({ description: 'ISO date si has_time' })
  @IsOptional()
  @IsString()
  end?: string;

  @ApiPropertyOptional({ description: 'fenêtre relative en secondes' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  start_sec?: number;

  @ApiPropertyOptional({ description: 'fenêtre relative en secondes' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  end_sec?: number;

  @ApiPropertyOptional({
    description: 'temps en secondes depuis le début',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  relative?: boolean;

  @ApiPropertyOptional({
    description: 'Nombre de points',
    default: 2000,
    minimum: 10,
    maximum: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(100000)
  points?: number;

  @ApiPropertyOptional({
    description: 'Méthode de downsampling',
    enum: DownsamplingMethod,
    default: DownsamplingMethod.LTTB,
  })
  @IsOptional()
  @IsEnum(DownsamplingMethod)
  method?: DownsamplingMethod;
}

export class WindowFilteredQueryDto {
  @ApiProperty({ description: 'UUID du canal' })
  @IsUUID()
  channel_id: string;

  @ApiPropertyOptional({ description: 'Timestamp Unix de début' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  start_timestamp?: number;

  @ApiPropertyOptional({ description: 'Timestamp Unix de fin' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  end_timestamp?: number;

  @ApiPropertyOptional({ description: 'Curseur temporel pour pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cursor?: number;

  @ApiPropertyOptional({ default: 250000, minimum: 10000, maximum: 1000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10000)
  @Max(1000000)
  limit?: number;

  @ApiPropertyOptional({ default: 2000, minimum: 10, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(100000)
  points?: number;

  @ApiPropertyOptional({
    enum: DownsamplingMethod,
    default: DownsamplingMethod.LTTB,
  })
  @IsOptional()
  @IsEnum(DownsamplingMethod)
  method?: DownsamplingMethod;
}
