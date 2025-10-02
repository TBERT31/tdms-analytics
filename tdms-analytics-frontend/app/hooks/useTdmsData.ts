import { useState, useEffect, useCallback } from "react";
import { fetchArrowTable, extractXY, ARROW_MIME } from "@/app/utils/arrow";

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

interface TimeRange {
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

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export function useTdmsData(config?: { useArrow?: boolean }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [globalData, setGlobalData] = useState<FilteredWindowResp | null>(null);
  const [loading, setLoading] = useState(false);
  const useArrow = Boolean(config?.useArrow);

  // Chargement des datasets
  const loadDatasets = useCallback(async () => {
    try {
      const response = await fetch(`${API}/datasets`, { cache: "no-store" });
      const datasets = await response.json();
      setDatasets(datasets);
      if (!datasetId && datasets?.length) {
        setDatasetId(datasets[0].dataset_id);
      }
    } catch (error) {
      console.error("Erreur chargement datasets:", error);
    }
  }, [datasetId]);

  // Chargement des channels
  const loadChannels = useCallback(async (selectedDatasetId: string) => {
    try {
      const response = await fetch(`${API}/datasets/${selectedDatasetId}/channels`, { cache: "no-store" });
      const channels = await response.json();
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

  // Chargement du time range
  const loadTimeRange = useCallback(async (selectedChannelId: string) => {
    try {
      const response = await fetch(`${API}/channels/${selectedChannelId}/time_range`, { cache: "no-store" });
      if (response.ok) {
        const range = await response.json();
        setTimeRange(range);
        console.log("Time range chargé:", range);
      }
    } catch (error) {
      console.error("Erreur chargement time range:", error);
    }
  }, []);

  // Chargement de la vue globale
  const loadGlobalView = useCallback(async (
    selectedChannelId: string,
    globalPoints: number,
    initialLimit: number
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        channel_id: selectedChannelId,
        points: String(globalPoints),
        method: "lttb",
        limit: String(initialLimit),
      });
      const url = `${API}/get_window_filtered?${params}`;

      if (useArrow) {
        try {
          const table = await fetchArrowTable(url); // => Table Arrow ou throw "NOT_ARROW"
          const { x, y } = extractXY(table);

          // has_time & unit via états déjà disponibles
          const has_time =
            timeRange?.has_time ??
            channels.find((c) => c.channel_id === selectedChannelId)?.has_time ??
            true;

          const unit =
            channels.find((c) => c.channel_id === selectedChannelId)?.unit ?? "";

          // on mappe dans la même shape que JSON pour le reste de l'app
          setGlobalData({
            x: Array.from(x),
            y: Array.from(y),
            unit,
            has_time,
            original_points: x.length,
            sampled_points: x.length,
            has_more: false,
            method: "lttb",
          });
          console.log(`Vue globale (Arrow) chargée: ${x.length} points`);
          return;
        } catch (e: any) {
          if (e?.message !== "NOT_ARROW") throw e;
          // sinon on retombe en JSON ci-dessous
        }
      }

      // --- Fallback JSON (chemin actuel) ---
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
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

  // Fonction de rechargement pour le zoom
  const createZoomReloadHandler = useCallback((zoomPoints: number) => {
    return async (range: { start: number; end: number }) => {
      if (!channelId || !timeRange) {
        throw new Error("Channel ou time range non disponible");
      }

      const params = new URLSearchParams({
        channel_id: channelId,
        start_timestamp: String(range.start),
        end_timestamp: String(range.end),
        points: String(zoomPoints),
        method: "lttb",
        limit: "200000",
      });
      const url = `${API}/get_window_filtered?${params}`;

      if (useArrow) {
        try {
          const table = await fetchArrowTable(url);
          const { x, y } = extractXY(table);
          console.log(`Zoom rechargé (Arrow): ${x.length} points`);
          return { x: Array.from(x), y: Array.from(y) };
        } catch (e: any) {
          if (e?.message !== "NOT_ARROW") throw e;
          // sinon fallback JSON ci-dessous
        }
      }

      // --- Fallback JSON ---
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      console.log(`Zoom rechargé (JSON): ${result.original_points} → ${result.sampled_points} points`);
      return { x: result.x, y: result.y };
    };
  }, [channelId, timeRange, useArrow]);

  // Effects pour les chargements automatiques
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (datasetId) loadChannels(datasetId);
  }, [datasetId, loadChannels]);

  return {
    // States
    datasets,
    datasetId,
    setDatasetId,
    channels,
    channelId,
    setChannelId,
    timeRange,
    globalData,
    loading,
    
    // Actions
    loadDatasets,
    loadTimeRange,
    loadGlobalView,
    createZoomReloadHandler
  };
}