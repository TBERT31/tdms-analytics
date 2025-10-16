import { IsString, IsNumber, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DatasetDto {
  @ApiProperty({ description: 'Dataset UUID' })
  @IsUUID()
  dataset_id: string;

  @ApiProperty({ description: 'Original filename' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'Creation timestamp' })
  @IsDateString()
  created_at: string;

  @ApiProperty({ description: 'Total number of points' })
  @IsNumber()
  total_points: number;
}

export class DatasetMetaDto {
  @ApiProperty({ description: 'Dataset UUID' })
  @IsUUID()
  dataset_id: string;

  @ApiProperty({ description: 'Original filename' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'List of channels', type: 'array' })
  channels: ChannelInfoDto[];

  @ApiProperty({ description: 'Total number of channels' })
  @IsNumber()
  total_channels: number;

  @ApiProperty({ description: 'Total number of points' })
  @IsNumber()
  total_points: number;

  @ApiProperty({ description: 'Creation timestamp' })
  @IsDateString()
  created_at: string;

  @ApiProperty({ description: 'Storage information' })
  @IsString()
  storage: string;
}

export class ChannelInfoDto {
  @ApiProperty({ description: 'Channel UUID' })
  @IsUUID()
  channel_id: string;

  @ApiProperty({ description: 'Group name' })
  @IsString()
  group: string;

  @ApiProperty({ description: 'Channel name' })
  @IsString()
  channel: string;

  @ApiProperty({ description: 'Number of rows' })
  @IsNumber()
  rows: number;

  @ApiProperty({ description: 'Has time data' })
  has_time: boolean;

  @ApiProperty({ description: 'Unit of measurement' })
  @IsString()
  unit: string;
}