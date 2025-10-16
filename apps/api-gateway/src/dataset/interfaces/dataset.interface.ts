export interface IDataset {
  dataset_id: string;
  filename: string;
  created_at: string;
  total_points: number;
}

export interface IDatasetMeta {
  dataset_id: string;
  filename: string;
  channels: IChannelInfo[];
  total_channels: number;
  total_points: number;
  created_at: string;
  storage: string;
}

export interface IChannelInfo {
  channel_id: string;
  group: string;
  channel: string;
  rows: number;
  has_time: boolean;
  unit: string;
}