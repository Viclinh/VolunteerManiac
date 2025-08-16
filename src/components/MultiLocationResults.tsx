import React from 'react';
import { MapPin, Calendar, Users, Heart, ChevronDown, ChevronUp } from 'lucide-react';
import { VolunteerOpportunity } from '../types/volunteer';
import { LocationGroup } from '../services/MultiLocationService';

interface MultiLocationResultsProps {
  locationGroups: LocationGroup[];
  searchStatistics: {
    totalLocations: number;
    successfulLocations: number;
    failedLocations: number;
    totalOpportunities: number;
    averageOpportunitiesPerLocation: number;
    locationBreakdown: { location: string; count: number }[];
  };
  className?: string;
}

export const MultiLocationResults: React.FC<MultiLocationResultsProps> = ({
  locationGroups,
  searchStatistics,
  className = ""
}) => {
  const [expandedLocations, setExpandedLocations] = React.useState<Set<number>>(
    new Set(locationGroups.map((_, index) => index)) // Start with all locations expanded
  );

  const toggleLocationExpansion = (index: number) => {
    const newExpanded = new Set(expandedLocations);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLocations(newExpanded);
  };

  const collapseAll = () => setExpandedLocations(new Set());
  const expandAll = () => setExpandedLocations(new Set(locationGroups.map((_, index) => index)));

  return (
    <div className={className}>
      {/* Multi-location Search Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Multi-Location Search Results
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Total Locations:</span>
                <div className="text-blue-900 font-semibold">{searchStatistics.totalLocations}</div>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Successful:</span>
                <div className="text-green-700 font-semibold">{searchStatistics.successfulLocations}</div>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Total Opportunities:</span>
                <div className="text-blue-900 font-semibold">{searchStatistics.totalOpportunities}</div>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Avg per Location:</span>
                <div className="text-blue-900 font-semibold">{searchStatistics.averageOpportunitiesPerLocation}</div>
              </div>
            </div>
          </div>
          
          {/* Expand/Collapse Controls */}
          <div className="flex space-x-2 ml-4">
            <button
              onClick={expandAll}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-300 hover:bg-blue-100"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-300 hover:bg-blue-100"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Location Groups */}
      <div className="space-y-6">
        {locationGroups.map((group, index) => (
          <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Location Header */}
            <div 
              className="bg-gray-50 px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => toggleLocationExpansion(index)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-gray-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {group.location.locationInfo.city}
                      {group.location.locationInfo.state && `, ${group.location.locationInfo.state}`}
                      , {group.location.locationInfo.country}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Original input: "{group.location.originalInput}"
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  {/* Status and Count */}
                  <div className="text-right">
                    {group.searchSuccess ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-green-700">
                          {group.opportunities.length} opportunities
                        </span>
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                          ✓ Success
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-red-700">
                          Search failed
                        </span>
                        <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                          ✗ Error
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Expand/Collapse Icon */}
                  {expandedLocations.has(index) ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
              
              {/* Error Message */}
              {!group.searchSuccess && group.error && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                  {group.error}
                </div>
              )}
            </div>

            {/* Location Results */}
            {expandedLocations.has(index) && (
              <div className="p-6">
                {group.searchSuccess && group.opportunities.length > 0 ? (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {group.opportunities.map((opportunity: VolunteerOpportunity) => (
                      <div 
                        key={opportunity.id}
                        className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                      >
                        {opportunity.image && (
                          <img 
                            src={opportunity.image}
                            alt={opportunity.title}
                            className="w-full h-48 object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="text-xl font-semibold text-gray-900 mb-1">
                                {opportunity.title}
                              </h4>
                              <p className="text-blue-600 font-medium">{opportunity.organization}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              opportunity.type === 'virtual' 
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {opportunity.type === 'virtual' ? 'Virtual' : 'In Person'}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between text-gray-600 mb-3">
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1" />
                              <span className="text-sm">{opportunity.location}</span>
                              {opportunity.type === 'in-person' && opportunity.distance !== undefined && (
                                <span className="text-sm text-blue-600 ml-2 font-medium">
                                  • {opportunity.distance.toFixed(1)} mi
                                </span>
                              )}
                              {opportunity.type === 'virtual' && (
                                <span className="text-sm text-purple-600 ml-2 font-medium">
                                  • No travel required
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              via {opportunity.source}
                            </span>
                          </div>
                          
                          <p className="text-gray-700 mb-4 line-clamp-2">
                            {opportunity.description}
                          </p>
                          
                          <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1" />
                              <span>{opportunity.date}</span>
                            </div>
                            {opportunity.participants && (
                              <div className="flex items-center">
                                <Users className="h-4 w-4 mr-1" />
                                <span>{opportunity.participants} volunteers needed</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {opportunity.timeCommitment}
                            </span>
                            <a
                              href={opportunity.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                            >
                              Apply Now
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : group.searchSuccess ? (
                  <div className="text-center py-8">
                    <Heart className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">No opportunities found in this location</p>
                    <p className="text-sm text-gray-500 mt-1">Try expanding your search radius or adjusting filters</p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-red-400 mb-2">⚠</div>
                    <p className="text-gray-600">Search failed for this location</p>
                    <p className="text-sm text-gray-500 mt-1">This location may be temporarily unavailable</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Location Breakdown Summary */}
      {searchStatistics.locationBreakdown.length > 0 && (
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Opportunities by Location</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {searchStatistics.locationBreakdown.map((item, index) => (
              <div key={index} className="text-center">
                <div className="text-lg font-bold text-blue-600">{item.count}</div>
                <div className="text-xs text-gray-600">{item.location}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};