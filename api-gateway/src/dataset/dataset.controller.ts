import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  ValidationPipe,
  Req,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { DatasetService } from './dataset.service';
import { WindowQueryDto, WindowFilteredQueryDto } from './dto/window-query.dto';
import { DatasetDto, DatasetMetaDto } from './dto/dataset.dto';
import { ChannelDto } from './dto/channel.dto';
import { TimeRangeDto } from './dto/time-range.dto';
import { IngestResponseDto } from './dto/ingest.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('dataset')
@ApiTags('Datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  // ========== Health ==========
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck() {
    return this.datasetService.healthCheck();
  }

  // ========== Datasets ==========
  @Get('datasets')
//   @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'List all datasets' })
  @ApiResponse({
    status: 200,
    description: 'List of datasets',
    type: [DatasetDto],
  })
  async listDatasets(): Promise<DatasetDto[]> {
    return this.datasetService.listDatasets();
  }

  @Get('dataset_meta')
//   @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'Get dataset metadata' })
  @ApiQuery({
    name: 'dataset_id',
    type: String,
    description: 'Dataset UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset metadata',
    type: DatasetMetaDto,
  })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async getDatasetMeta(
    @Query('dataset_id', new ParseUUIDPipe()) datasetId: string,
  ): Promise<DatasetMetaDto> {
    return this.datasetService.getDatasetMeta(datasetId);
  }

  @Delete('datasets/:datasetId')
//   @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a dataset' })
  @ApiParam({
    name: 'datasetId',
    type: String,
    description: 'Dataset UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Dataset deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Dataset deleted successfully' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async deleteDataset(
    @Param('datasetId', new ParseUUIDPipe()) datasetId: string,
  ): Promise<{ message: string }> {
    return this.datasetService.deleteDataset(datasetId);
  }

  // ========== Channels ==========
  @Get('datasets/:datasetId/channels')
//   @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'List channels for a dataset' })
  @ApiParam({
    name: 'datasetId',
    type: String,
    description: 'Dataset UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of channels',
    type: [ChannelDto],
  })
  @ApiResponse({ status: 404, description: 'Dataset not found' })
  async listChannels(
    @Param('datasetId', new ParseUUIDPipe()) datasetId: string,
  ): Promise<ChannelDto[]> {
    return this.datasetService.listChannels(datasetId);
  }

  @Get('channels/:channelId/time_range')
//   @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'Get channel time range' })
  @ApiParam({
    name: 'channelId',
    type: String,
    description: 'Channel UUID',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Channel time range',
    type: TimeRangeDto,
  })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async getChannelTimeRange(
    @Param('channelId', new ParseUUIDPipe()) channelId: string,
  ): Promise<TimeRangeDto> {
    return this.datasetService.getChannelTimeRange(channelId);
  }

  // ========== Data Windows ==========
  @Get('window')
//   @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'Get windowed sensor data with downsampling' })
  @ApiResponse({
    status: 200,
    description: 'Windowed sensor data (JSON or Arrow format)',
  })
  async getWindow(
    @Query(new ValidationPipe({ transform: true })) query: WindowQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const response = await this.datasetService.getWindow(query, req.headers);

    // Handle Arrow response
    if (req.headers.accept?.includes('application/vnd.apache.arrow.stream')) {
      if ('data' in response) {
        res.set('Content-Type', 'application/vnd.apache.arrow.stream');
        res.set('Content-Disposition', 'attachment; filename="window.arrow"');
        return res.send(response.data);
      }
    }

    const data = 'data' in response ? response.data : response;
    return res.json(data);
  }

  @Get('get_window_filtered')
//   @Roles('ADMIN', 'USER')
  @ApiOperation({ summary: 'Get filtered and paginated window data' })
  @ApiResponse({
    status: 200,
    description: 'Filtered window data (JSON or Arrow format)',
  })
  async getWindowFiltered(
    @Query(new ValidationPipe({ transform: true }))
    query: WindowFilteredQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const response = await this.datasetService.getWindowFiltered(
      query,
      req.headers,
    );

    // Handle Arrow response
    if (req.headers.accept?.includes('application/vnd.apache.arrow.stream')) {
      if ('data' in response) {
        res.set('Content-Type', 'application/vnd.apache.arrow.stream');
        res.set(
          'Content-Disposition',
          'attachment; filename="window_filtered.arrow"',
        );
        return res.send(response.data);
      }
    }

    const data = 'data' in response ? response.data : response;
    return res.json(data);
  }

  // ========== Ingestion ==========
  @Post('ingest')
//   @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Ingest TDMS file into ClickHouse' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'TDMS file to ingest',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'TDMS file (.tdms extension)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'File ingested successfully',
    type: IngestResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or file type' })
  @ApiResponse({ status: 500, description: 'Ingestion failed' })
  async ingestTdmsFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<IngestResponseDto> {
    if (!file) {
      throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
    }

    if (!file.originalname.toLowerCase().endsWith('.tdms')) {
      throw new HttpException(
        'Only TDMS files are supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.datasetService.ingestTdmsFile(file);
  }

  @Get('api/constraints')
  @ApiOperation({ summary: 'Get API constraints for frontend validation' })
  @ApiResponse({
    status: 200,
    description: 'API constraints',
    schema: {
      type: 'object',
      properties: {
        points_min: { type: 'number', example: 10 },
        points_max: { type: 'number', example: 100000 },
        default_points: { type: 'number', example: 2000 },
        limit_min: { type: 'number', example: 10000 },
        limit_max: { type: 'number', example: 1000000 },
        default_limit: { type: 'number', example: 250000 },
        chunk_size: { type: 'number', example: 500000 },
      },
    },
  })
  async getApiConstraints() {
    return this.datasetService.getApiConstraints();
  }
}