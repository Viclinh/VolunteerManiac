export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationInfo {
  city: string;
  state?: string;
  country: string;
  formattedAddress: string;
}

export interface GeolocationResult {
  coordinates: Coordinates;
  address: LocationInfo;
  accuracy: number;
}

export interface LocationSuggestion {
  displayName: string;
  coordinates: Coordinates;
  details: LocationInfo;
}

export interface GeolocationError {
  code: number;
  message: string;
  type: 'permission_denied' | 'position_unavailable' | 'timeout' | 'not_supported';
}