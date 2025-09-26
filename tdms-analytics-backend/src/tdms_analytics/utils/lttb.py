import numpy as np
import pandas as pd


def smart_downsample_production(df: pd.DataFrame, target_points: int) -> pd.DataFrame:
    """
    Intelligent downsampling using LTTB algorithm for time series data.
    
    Args:
        df: DataFrame with 'time' and 'value' columns
        target_points: Target number of points after downsampling
        
    Returns:
        Downsampled DataFrame
    """
    if len(df) <= target_points:
        return df
        
    if target_points < 3:
        # For very small target, just take first, middle, and last points
        indices = [0, len(df) // 2, len(df) - 1][:target_points]
        return df.iloc[indices].copy()
    
    # LTTB algorithm implementation
    time_values = df['time'].values
    data_values = df['value'].values
    
    # Always include first and last points
    sampled_indices = [0]
    
    # Calculate bucket size
    bucket_size = (len(df) - 2) / (target_points - 2)
    
    a = 0  # Initially a is the first point in the triangle
    
    for i in range(target_points - 2):  # -2 because we already have first and will add last
        # Calculate point average for next bucket
        avg_range_start = int((i + 1) * bucket_size) + 1
        avg_range_end = min(int((i + 2) * bucket_size) + 1, len(df))
        
        if avg_range_end <= avg_range_start:
            break
            
        avg_x = np.mean(time_values[avg_range_start:avg_range_end])
        avg_y = np.mean(data_values[avg_range_start:avg_range_end])
        
        # Get the range for this bucket
        range_start = int(i * bucket_size) + 1
        range_end = min(int((i + 1) * bucket_size) + 1, len(df))
        
        if range_end <= range_start:
            break
            
        # Calculate triangle areas for points in current bucket
        max_area = -1
        max_area_point = range_start
        
        for j in range(range_start, range_end):
            area = abs((time_values[a] - avg_x) * (data_values[j] - data_values[a]) -
                      (time_values[a] - time_values[j]) * (avg_y - data_values[a])) * 0.5
            
            if area > max_area:
                max_area = area
                max_area_point = j
        
        sampled_indices.append(max_area_point)
        a = max_area_point  # This point is the next a
    
    # Always include the last point
    sampled_indices.append(len(df) - 1)
    
    # Remove duplicates and sort
    sampled_indices = sorted(list(set(sampled_indices)))
    
    return df.iloc[sampled_indices].copy().reset_index(drop=True)