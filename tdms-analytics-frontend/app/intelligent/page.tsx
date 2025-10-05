"use client";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Zap, Database, RefreshCw, Info } from "lucide-react";
import IntelligentPlotClient from "../components/intelligent/IntelligentPlotClient";
import UploadBox from "../components/UploadBox";
import AdvancedSettings from "../components/AdvancedSettings";
import DatasetInfo from "../components/DatasetInfo";
import { useTdmsData } from "../hooks/useTdmsData";
import { useAdvancedSettings } from "../hooks/useAdvancedSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DatasetSelector from "../components/DatasetSelector";
import { request } from "http";

export default function IntelligentPage() {
  
  const {
    globalPoints,
    setGlobalPoints,
    zoomPoints,
    setZoomPoints,
    requestLimit,
    setRequestLimit,
    showAdvancedSettings,
    setShowAdvancedSettings,
    backendConstraints,
    validateParam,
    resetToDefaults,
    allParamsValid,
    arrowEnabled, 
    setArrowEnabled,
  } = useAdvancedSettings();
  
  const {
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
  } = useTdmsData({ useArrow: arrowEnabled }); 

  const [startWindow, setStartWindow] = useState<number | null>(null);
  const [endWindow, setEndWindow] = useState<number | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleZoomSync = useCallback((start: number, end: number) => {
    setStartWindow(start);
    setEndWindow(end);
  }, []);

  useEffect(() => {
    if (channelId) {
      setStartWindow(0);
      setEndWindow(requestLimit);
      
      loadTimeRange(channelId);
      loadGlobalView(channelId, globalPoints, requestLimit, 0, requestLimit);
    }
  }, [channelId, requestLimit]);

  useEffect(() => {
    if (!channelId) return;
    
    if (startWindow === null && endWindow === null) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Attendre 800ms après la dernière frappe avant de charger
    debounceTimerRef.current = setTimeout(() => {
      console.log('Chargement avec fenêtre manuelle:', { startWindow, endWindow });
      loadGlobalView(channelId, globalPoints, requestLimit, startWindow, endWindow);
    }, 800);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [startWindow, endWindow]); 

  useEffect(() => {
    if (channelId) {
      loadGlobalView(channelId, globalPoints, requestLimit);
    }

  }, [arrowEnabled]); 

  const title = useMemo(() => {
    const channel = channels.find(channel => channel.channel_id === channelId);
    return channel ? `${channel.group_name} / ${channel.channel_name}` : "Signal";
  }, [channels, channelId]);

  const plotData = useMemo(() => {
    if (!globalData) return null;
    return {
      x: globalData.x,
      y: globalData.y,
      title,
      unit: globalData.unit,
      has_time: globalData.has_time,
    };
  }, [globalData, title]);

  const handleZoomReload = useMemo(
    () => async (range: { start: number; end: number }) => {
      // Synchroniser les champs de fenêtre
      handleZoomSync(range.start, range.end);
      
      // Puis charger les données
      const handler = createZoomReloadHandler(zoomPoints);
      return handler(range);
    },
    [createZoomReloadHandler, zoomPoints, handleZoomSync]
  );

  const canReload =
    Boolean(channelId) &&
    validateParam(globalPoints, "points").isValid &&
    validateParam(requestLimit, "limit").isValid;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">TDMS Viewer</h1>
              <p className="text-gray-600">Zoom Intelligent</p>
            </div>
          </div>

          <Alert className="bg-green-50 border-green-200">
            <Zap className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Mode Intelligent:</strong> Vue globale ({globalPoints.toLocaleString()} pts) puis
              rechargement automatique avec plus de détails ({zoomPoints.toLocaleString()} pts) lors du zoom.
              Limite initiale: {requestLimit.toLocaleString()} pts.
            </AlertDescription>
          </Alert>
        </div>

        {/* Upload */}
        <UploadBox onDone={loadDatasets} />

        {/* Paramètres avancés */}
        <AdvancedSettings
          globalPoints={globalPoints}
          setGlobalPoints={setGlobalPoints}
          zoomPoints={zoomPoints}
          setZoomPoints={setZoomPoints}
          requestLimit={requestLimit}
          setRequestLimit={setRequestLimit}
          showAdvancedSettings={showAdvancedSettings}
          setShowAdvancedSettings={setShowAdvancedSettings}
          backendConstraints={backendConstraints}
          validateParam={validateParam}
          resetToDefaults={resetToDefaults}
          allParamsValid={allParamsValid}
          arrowEnabled={arrowEnabled}
          setArrowEnabled={setArrowEnabled}
        />

        {/* Sélection Dataset/Channel */}
        <DatasetSelector
          datasets={datasets}
          datasetId={datasetId}
          setDatasetId={setDatasetId}
          channels={channels}
          channelId={channelId}
          setChannelId={setChannelId}
          timeRange={timeRange}
          startWindow={startWindow}
          setStartWindow={setStartWindow}
          endWindow={endWindow}
          setEndWindow={setEndWindow}
          loading={loading}
          canReload={canReload}
          onReload={() => channelId && loadGlobalView(
            channelId, globalPoints, requestLimit, startWindow, endWindow
          )}
          requestLimit={requestLimit}
        />

        {/* Infos dataset */}
        <DatasetInfo timeRange={timeRange} globalData={globalData} initialLimit={requestLimit} />

        {/* Graphique */}
        {!plotData && !loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Sélectionnez un canal pour commencer</h3>
              <p className="text-gray-600">Choisissez un dataset et un canal pour explorer vos données TDMS</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <RefreshCw className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Chargement de la vue globale...</h3>
              <p className="text-gray-600">Préparation des données pour l'affichage</p>
            </CardContent>
          </Card>
        )}

        {plotData && channelId && timeRange && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <IntelligentPlotClient
                key={`${channelId}-${globalPoints}-${zoomPoints}`}
                channelId={channelId}
                initialData={plotData}
                timeRange={timeRange}
                onZoomReload={handleZoomReload}
              />
            </CardContent>
          </Card>
        )}

        {plotData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Guide d'utilisation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🔧</Badge>
                    <span className="font-medium">Paramètres</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Ajustez les paramètres avancés pour optimiser selon vos fichiers
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🔍</Badge>
                    <span className="font-medium">Zoom</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Cliquez-glissez sur le graphique pour zoomer
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🔄</Badge>
                    <span className="font-medium">Rechargement auto</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Les données sont rechargées automatiquement avec plus de précision
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">🏠</Badge>
                    <span className="font-medium">Reset</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    Double-clic pour revenir à la vue globale
                  </p>
                </div>
              </div>

              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <strong>Conseils performance :</strong> Pour les gros fichiers (&gt;1M points), 
                  augmentez la limite initiale. Pour les détails fins, augmentez les points zoom. 
                  Pour la fluidité, diminuez les points vue globale.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
