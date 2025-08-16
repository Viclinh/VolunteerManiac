import React, { useState } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp, Wifi, WifiOff } from 'lucide-react';
import { APIError, ServiceStatus } from '../types/volunteer';

interface ErrorDisplayProps {
  errors?: APIError[];
  serviceStatuses?: ServiceStatus[];
  partialResults?: boolean;
  totalResults?: number;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  errors = [],
  serviceStatuses = [],
  partialResults = false,
  totalResults = 0,
  onRetry,
  isRetrying = false,
  className = ""
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showServiceStatus, setShowServiceStatus] = useState(false);

  if (errors.length === 0) {
    return null;
  }

  const criticalErrors = errors.filter(error => 
    !error.retryable || error.type === 'authentication'
  );
  const retryableErrors = errors.filter(error => 
    error.retryable && error.type !== 'authentication'
  );

  const getErrorSeverity = () => {
    if (totalResults === 0 && criticalErrors.length > 0) {
      return 'critical';
    } else if (partialResults || retryableErrors.length > 0) {
      return 'warning';
    }
    return 'info';
  };

  const severity = getErrorSeverity();
  
  const severityStyles = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconStyles = {
    critical: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400'
  };

  const getMainMessage = () => {
    if (totalResults > 0) {
      if (errors.length === 1) {
        return `Found ${totalResults} opportunities, but ${errors[0].source} was unavailable`;
      } else {
        return `Found ${totalResults} opportunities, but ${errors.length} sources had issues`;
      }
    } else {
      if (criticalErrors.length > 0) {
        return 'Unable to search volunteer opportunities due to service issues';
      } else {
        return 'All volunteer services are temporarily unavailable';
      }
    }
  };

  const getAllSuggestions = () => {
    const suggestions = new Set<string>();
    
    if (totalResults > 0) {
      suggestions.add('Results shown are from available sources');
      suggestions.add('Try again later for complete results');
    } else {
      suggestions.add('Try again in a few minutes');
      suggestions.add('Check your internet connection');
    }

    // Add specific suggestions from errors
    errors.forEach(error => {
      error.suggestions?.forEach(suggestion => suggestions.add(suggestion));
    });

    return Array.from(suggestions);
  };

  return (
    <div className={`rounded-lg border p-4 ${severityStyles[severity]} ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${iconStyles[severity]}`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">
            {severity === 'critical' ? 'Search Issues' : 'Partial Results'}
          </h3>
          <p className="mt-1 text-sm">
            {getMainMessage()}
          </p>

          {/* Suggestions */}
          <div className="mt-2">
            <ul className="text-xs space-y-1">
              {getAllSuggestions().slice(0, 3).map((suggestion, index) => (
                <li key={index} className="flex items-start space-x-1">
                  <span className="mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {retryableErrors.length > 0 && onRetry && (
              <button
                onClick={onRetry}
                disabled={isRetrying}
                className={`inline-flex items-center px-3 py-1 rounded text-xs font-medium transition-colors ${
                  severity === 'critical' 
                    ? 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400' 
                    : 'bg-yellow-600 text-white hover:bg-yellow-700 disabled:bg-yellow-400'
                }`}
              >
                {isRetrying ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry Failed Sources
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show Details
                </>
              )}
            </button>

            {serviceStatuses.length > 0 && (
              <button
                onClick={() => setShowServiceStatus(!showServiceStatus)}
                className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
              >
                <Wifi className="h-3 w-3 mr-1" />
                Service Status
              </button>
            )}
          </div>

          {/* Error Details */}
          {showDetails && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <h4 className="text-xs font-medium mb-2">Error Details:</h4>
              <div className="space-y-2">
                {errors.map((error, index) => (
                  <div key={index} className="text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{error.source}:</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        error.retryable 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {error.type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-gray-600">{error.userMessage}</p>
                    {error.suggestions && error.suggestions.length > 0 && (
                      <ul className="mt-1 ml-4 space-y-0.5">
                        {error.suggestions.map((suggestion, suggestionIndex) => (
                          <li key={suggestionIndex} className="text-gray-500">
                            • {suggestion}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Service Status */}
          {showServiceStatus && serviceStatuses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <h4 className="text-xs font-medium mb-2">Service Status:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {serviceStatuses.map((status, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                    <div className="flex items-center space-x-2">
                      {status.healthy ? (
                        <Wifi className="h-3 w-3 text-green-500" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-xs font-medium">{status.serviceName}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {status.healthy ? (
                        status.responseTime ? `${status.responseTime}ms` : 'OK'
                      ) : (
                        'Unavailable'
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};