import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsUUID, IsArray } from 'class-validator';

export class IngestResponseDto {
  @ApiProperty({ description: 'Dataset UUID' })
  @IsUUID()
  dataset_id: string;

  @ApiProperty({ description: 'Original filename' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'Number of channels created' })
  @IsNumber()
  channels_count: number;

  @ApiProperty({ description: 'Channel metadata list' })
  @IsArray()
  channels: ChannelMetadataDto[];
}

export class ChannelMetadataDto {
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