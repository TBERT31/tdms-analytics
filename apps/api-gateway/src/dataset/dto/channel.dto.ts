import { IsString, IsNumber, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChannelDto {
  @ApiProperty({ description: 'Channel UUID' })
  @IsUUID()
  channel_id: string;

  @ApiProperty({ description: 'Dataset UUID' })
  @IsUUID()
  dataset_id: string;

  @ApiProperty({ description: 'Group name' })
  @IsString()
  group_name: string;

  @ApiProperty({ description: 'Channel name' })
  @IsString()
  channel_name: string;

  @ApiProperty({ description: 'Unit of measurement' })
  @IsString()
  unit: string;

  @ApiProperty({ description: 'Has time data' })
  @IsBoolean()
  has_time: boolean;

  @ApiProperty({ description: 'Number of rows' })
  @IsNumber()
  n_rows: number;
}
