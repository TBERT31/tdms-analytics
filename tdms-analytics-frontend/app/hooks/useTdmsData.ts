import { useState, useEffect, useCallback } from "react";
import { fetchArrowTable, extractXY } from "@/app/utils/arrow";
import { datasetApi } from "@/app/services/apiClient";

interface Dataset {
  dataset_id: string;
  filename: string;
  created_at: string;
  total_points: number;
}

interface Channel {
  channel_id: string;
  dataset_id: string;
  group_name: string;
  channel_name: string;
  unit: string;
  has_time: boolean;
  n_rows: number;
}

interface FilteredWindowResp {
  x: number[];
  y: number[];
  unit?: string;
  has_time: boolean;
  original_points: number;
  sampled_points: number;
  has_more: boolean;
  next_cursor?: number;
  method: string;
}

export interface TimeRange {
  channel_id: string;
  has_time: boolean;
  min_timestamp?: number;
  max_timestamp?: number;
  min_iso?: string;
  max_iso?: string;
  min_index?: number;
  max_index?: number;
  total_points: number;
}

export function useTdmsData(config?: { useArrow?: boolean }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [globalData, setGlobalData] = useState<FilteredWindowResp | null>(null);
  const [loading, setLoading] = useState(false);
  const useArrow = Boolean(config?.useArrow);

  const loadDatasets = useCallback(async () => {
    try {
      const datasets = await datasetApi.getDatasets();
      setDatasets(datasets);
      if (!datasetId && datasets?.length) {
        setDatasetId(datasets[0].dataset_id);
      }
    } catch (error) {
      console.error("Erreur chargement datasets:", error);
    }
  }, [datasetId]);

  const loadChannels = useCallback(async (selectedDatasetId: string) => {
    try {
      const channels = await datasetApi.getDatasetChannels(selectedDatasetId);
      setChannels(channels);
      if (channels?.length) {
        setChannelId(channels[0].channel_id);
      } else {
        setChannelId(null);
      }
    } catch (error) {
      console.error("Erreur chargement channels:", error);
    }
  }, []);

  const loadTimeRange = useCallback(async (selectedChannelId: string) => {
    try {
      const range = await datasetApi.getChannelTimeRange(selectedChannelId);
      setTimeRange(range);
      console.log("Time range chargé:", range);
    } catch (error) {
      console.error("Erreur chargement time range:", error);
    }
  }, []);

  const loadGlobalView = useCallback(async (
    selectedChannelId: string,
    globalPoints: number,
    requestLimit: number,
    startWindow?: number | null,
    endWindow?: number | null,
    method: "lttb" | "uniform" | "clickhouse" = "lttb",
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        channel_id: selectedChannelId,
        points: String(globalPoints),
        method,
        limit: String(requestLimit),
      });

      if (startWindow !== null && startWindow !== undefined) {
        params.append("start_timestamp", String(startWindow));
      }
      if (endWindow !== null && endWindow !== undefined) {
        params.append("end_timestamp", String(endWindow));
      }

      if (useArrow) {
        try {
          // ⭐ Passe directement les params à fetchArrowTable
          const table = await fetchArrowTable(params);
          const { x, y } = extractXY(table);

          const has_time =
            timeRange?.has_time ??
            channels.find((c) => c.channel_id === selectedChannelId)?.has_time ??
            true;

          const unit =
            channels.find((c) => c.channel_id === selectedChannelId)?.unit ?? "";

          setGlobalData({
            x: Array.from(x),
            y: Array.from(y),
            unit,
            has_time,
            original_points: x.length,
            sampled_points: x.length,
            has_more: false,
            method,
          });
          console.log(`Vue globale (Arrow) chargée: ${x.length} points`);
          return;
        } catch (e: any) {
          if (e?.message !== "NOT_ARROW") throw e;
        }
      }

      const result = await datasetApi.getWindowFiltered(params);
      setGlobalData(result);
      console.log(
        `Vue globale (JSON) chargée: ${result.original_points} → ${result.sampled_points} points`
      );
    } catch (error) {
      console.error("Erreur chargement vue globale:", error);
    } finally {
      setLoading(false);
    }
  }, [useArrow, timeRange, channels]);

  const createZoomReloadHandler = useCallback(
    (zoomPoints: number, method: "lttb"|"uniform"|"clickhouse" = "lttb") => {
      return async (range: { start: number; end: number }) => {
        if (!channelId || !timeRange) {
          throw new Error("Channel ou time range non disponible");
        }

        const params = new URLSearchParams({
          channel_id: channelId,
          start_timestamp: String(range.start),
          end_timestamp: String(range.end),
          points: String(zoomPoints),
          method,
          limit: "200000",
        });

        if (useArrow) {
          try {
            // ⭐ Passe directement les params à fetchArrowTable
            const table = await fetchArrowTable(params);
            const { x, y } = extractXY(table);
            console.log(`Zoom rechargé (Arrow): ${x.length} points`);
            return { x: Array.from(x), y: Array.from(y) };
          } catch (e: any) {
            if (e?.message !== "NOT_ARROW") throw e;
          }
        }

        const result = await datasetApi.getWindowFiltered(params);
        console.log(`Zoom rechargé (JSON): ${result.original_points} → ${result.sampled_points} points`);
        return { x: result.x, y: result.y };
      };
    }, 
    [channelId, timeRange, useArrow]
  );

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (datasetId) loadChannels(datasetId);
  }, [datasetId, loadChannels]);

  return {
    datasets,
    datasetId,
    setDatasetId,
    channels,
    channelId,
    setChannelId,
    timeRange,
    globalData,
    loading,
    loadDatasets,
    loadTimeRange,
    loadGlobalView,
    createZoomReloadHandler
  };
}