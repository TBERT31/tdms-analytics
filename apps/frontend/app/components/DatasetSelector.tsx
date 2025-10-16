// tdms-analytics-frontend/app/components/DatasetSelector.tsx
import { Database, RefreshCw, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TimeRange } from "../hooks/useTdmsData";

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

interface DatasetSelectorProps {
  datasets: Dataset[];
  datasetId: string | null;
  setDatasetId: (id: string) => void;
  channels: Channel[];
  channelId: string | null;
  setChannelId: (id: string) => void;
  timeRange: TimeRange | null;
  startWindow: number | null;
  setStartWindow: (value: number | null) => void;
  endWindow: number | null;
  setEndWindow: (value: number | null) => void;
  loading: boolean;
  canReload: boolean;
  onReload: () => void;
  requestLimit: number;
}

export default function DatasetSelector({
  datasets,
  datasetId,
  setDatasetId,
  channels,
  channelId,
  setChannelId,
  timeRange,
  startWindow,
  setStartWindow,
  endWindow,
  setEndWindow,
  loading,
  canReload,
  onReload,
  requestLimit,
}: DatasetSelectorProps) {
  
  // Validation de la fenêtre temporelle
  const validateWindow = () => {
    if (!timeRange) return { isValid: true, errors: [] };
    
    const errors: string[] = [];
    const minBound = timeRange?.has_time ? timeRange?.min_timestamp : timeRange?.min_index;
    const maxBound = timeRange?.has_time ? timeRange?.max_timestamp : timeRange?.max_index;
    const unit = timeRange.has_time ? "s" : "";

    const computedStart = startWindow !== null ? startWindow : (minBound ?? null);

    const effectiveEnd =
        endWindow !== null
            ? endWindow
            : (computedStart !== null && maxBound !== undefined
                ? (!timeRange?.has_time
                    ? Math.min(computedStart + requestLimit, maxBound)
                    : null) 
                : null);

    if (startWindow !== null && minBound !== undefined && startWindow < minBound) {
      errors.push(`Départ (${startWindow}${unit}) < borne min (${minBound.toFixed(1)}${unit})`);
    }

    if (startWindow !== null && maxBound !== undefined && startWindow > maxBound) {
      errors.push(`Départ (${startWindow}${unit}) > borne max (${maxBound.toFixed(1)}${unit})`);
    }

    if (endWindow !== null && maxBound !== undefined && endWindow > maxBound) {
      errors.push(`Fin (${endWindow}${unit}) > borne max (${maxBound.toFixed(1)}${unit})`);
    }

    if (startWindow !== null && endWindow !== null && startWindow >= endWindow) {
      errors.push(`Départ (${startWindow}${unit}) doit être < Fin (${endWindow}${unit})`);
    }

    if (!timeRange?.has_time && computedStart !== null && endWindow !== null) {
        const width = endWindow - computedStart;
        if (width > requestLimit) {
            errors.push(
            `Fenêtre trop large : ${width.toLocaleString()} échantillons > plage maximale (${requestLimit.toLocaleString()}). ` +
            `Réduisez la fin à ≤ début + plage maximale, ou augmentez la plage maximale.`
            );
        }
    }

    return { isValid: errors.length === 0, errors };
  };

  const windowValidation = validateWindow();
  const hasWindowValues = startWindow !== null || endWindow !== null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Sélection des données
        </CardTitle>
        <CardDescription>
          Choisissez un dataset, un canal et optionnellement une plage temporelle
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Ligne 1: Dataset et Channel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Dataset</Label>
              <Select 
                value={datasetId ?? ""} 
                onValueChange={(value) => setDatasetId(value)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un dataset..." />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map(dataset => (
                    <SelectItem key={dataset.dataset_id} value={dataset.dataset_id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{dataset.dataset_id.slice(0, 8)}</Badge>
                        {dataset.filename}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Channel</Label>
              <Select 
                value={channelId ?? ""} 
                onValueChange={(value) => setChannelId(value)}
                disabled={loading || !channels.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un canal..." />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(channel => (
                    <SelectItem key={channel.channel_id} value={channel.channel_id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{channel.group_name} — {channel.channel_name}</span>
                        <Badge variant="secondary" className="ml-2">
                          {channel.n_rows.toLocaleString()}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ligne 2: Plage temporelle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="startWindow" className="text-sm font-medium text-gray-700">
                  Début de fenêtre {timeRange?.has_time ? "(secondes)" : "(échantillons)"}
                </Label>
                {hasWindowValues && (
                  <Badge variant="secondary" className="text-xs">
                    Synchro zoom
                  </Badge>
                )}
              </div>
              <Input
                id="startWindow"
                type="number"
                value={startWindow ?? ""}
                onChange={(e) => setStartWindow(e.target.value ? Number(e.target.value) : null)}
                placeholder={timeRange?.has_time ? "Ex: 50" : "Ex: 1000"}
                disabled={!channelId}
                className={
                  !windowValidation.isValid && startWindow !== null
                    ? "border-red-500 focus:border-red-500 bg-red-50"
                    : ""
                }
              />
              <p className="text-xs text-muted-foreground">
                {timeRange?.has_time
                    ? `Min: ${timeRange.min_timestamp?.toFixed(1)}s, Max: ${timeRange.max_timestamp?.toFixed(1)}s`
                    : timeRange
                    ? `Min: ${timeRange.min_index?.toLocaleString()}, Max: ${timeRange.max_index?.toLocaleString()}`
                    : "Sélectionnez un canal"
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endWindow" className="text-sm font-medium text-gray-700">
                Fin de fenêtre {timeRange?.has_time ? "(secondes)" : "(échantillons)"}
              </Label>
              <Input
                id="endWindow"
                type="number"
                value={endWindow ?? ""}
                onChange={(e) => setEndWindow(e.target.value ? Number(e.target.value) : null)}
                placeholder={timeRange?.has_time ? "Ex: 1500" : "Ex: 50000"}
                disabled={!channelId}
                className={
                  !windowValidation.isValid && endWindow !== null
                    ? "border-red-500 focus:border-red-500 bg-red-50"
                    : ""
                }
              />
              <p className="text-xs text-muted-foreground">
                {timeRange?.has_time
                    ? `Si vide, la fin sera déterminée par le serveur selon la plage maximale (en points).`
                    : `Si vide, fin = min(début + plage maximale = ${requestLimit.toLocaleString()}, borne max)`
                }
              </p>
            </div>
          </div>

          {/* Ligne 3: Boutons d'action */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setStartWindow(null);
                setEndWindow(null);
              }}
              disabled={!hasWindowValues}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Réinitialiser fenêtre
            </Button>

            <Button
              onClick={onReload}
              disabled={!canReload || loading || !windowValidation.isValid}
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Chargement...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recharger
                </>
              )}
            </Button>
          </div>

          {/* Alerte de validation */}
          {!windowValidation.isValid && hasWindowValues && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Erreur de plage temporelle :</strong>
                <ul className="list-disc ml-4 mt-1">
                  {windowValidation.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}