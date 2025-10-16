export interface IWindowResponse {
  x: number[];
  y: number[];
  unit: string;
  has_time: boolean;
  x_unit?: string;
  method: string;
  original_points: number;
  returned_points: number;
}

export interface IWindowFilteredResponse extends IWindowResponse {
  sampled_points: number;
  has_more: boolean;
  next_cursor?: number;
  performance: {
    optimization: string;
    filtered_points?: number;
    limited_points?: number;
  };
}

export interface IHealthResponse {
  status: string;
  clickhouse: string;
  tables: string;
  architecture: string;
  timestamp: string;
}

export interface IApiConstraints {
  points_min: number;
  points_max: number;
  default_points: number;
  limit_min: number;
  limit_max: number;
  default_limit: number;
  chunk_size: number;
}
