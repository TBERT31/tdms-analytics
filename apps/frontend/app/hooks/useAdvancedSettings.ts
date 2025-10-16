import { useState, useEffect } from "react";
import { datasetApi } from "@/app/services/apiClient";

interface BackendConstraints {
  points: { min: number; max: number };
  limit: { min: number; max: number };
}

export function useAdvancedSettings() {
  const [globalPoints, setGlobalPoints] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_GLOBAL_POINTS) || 2000
  );
  const [zoomPoints, setZoomPoints] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM_POINTS) || 3000
  );
  const [requestLimit, setRequestLimit] = useState(
    Number(process.env.NEXT_PUBLIC_DEFAULT_INITIAL_LIMIT) || 100000
  );

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const [backendConstraints, setBackendConstraints] = useState<BackendConstraints>({
    points: { min: 10, max: 20000 },
    limit: { min: 10000, max: 200000 }
  });

  const [arrowEnabled, setArrowEnabled] = useState(
    String(process.env.NEXT_PUBLIC_ENABLE_ARROW ?? "true").toLowerCase() === "true"
  );

  const [downsamplingMethod, setDownsamplingMethod] = useState<"lttb"|"uniform"|"clickhouse">("lttb");

  useEffect(() => {
    const loadConstraints = async () => {
      try {
        const constraints = await datasetApi.getConstraints();
        setBackendConstraints(constraints);
        console.log("Contraintes backend chargées:", constraints);
      } catch (error) {
        console.warn("Impossible de charger les contraintes backend, utilisation des valeurs par défaut:", error);
      }
    };
    loadConstraints();
  }, []);

  const validateParam = (value: number, type: 'points' | 'limit') => {
    const constraints = backendConstraints[type];
    return {
      isValid: value >= constraints.min && value <= constraints.max,
      min: constraints.min,
      max: constraints.max
    };
  };

  const resetToDefaults = () => {
    setGlobalPoints(Number(process.env.NEXT_PUBLIC_DEFAULT_GLOBAL_POINTS) || 2000);
    setZoomPoints(Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM_POINTS) || 3000);
    setRequestLimit(Number(process.env.NEXT_PUBLIC_DEFAULT_INITIAL_LIMIT) || 100000);
  };

  const allParamsValid = 
    validateParam(globalPoints, 'points').isValid && 
    validateParam(zoomPoints, 'points').isValid && 
    validateParam(requestLimit, 'limit').isValid;

  return {
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
    downsamplingMethod, 
    setDownsamplingMethod,
  };
}