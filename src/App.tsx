import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Calendar, Users, Heart, Filter, X } from 'lucide-react';
import { LocationInput } from './components/LocationInput';
import { DistanceRadiusSelector } from './components/DistanceRadiusSelector';
import { ErrorDisplay } from './components/ErrorDisplay';
import { MultiLocationResults } from './components/MultiLocationResults';
import { searchController, SearchResult, MultiLocationSearchResult } from './services/SearchController';
import { apiServiceRegistry } from './services/api/APIServiceRegistry';
import { VolunteerHubAdapter } from './services/api/adapters/VolunteerHubAdapter';
import { JustServeAdapter } from './services/api/adapters/JustServeAdapter';
import { IdealistAdapter } from './services/api/adapters/IdealistAdapter';
import { GeolocationService } from './services/geolocationService';
import { GeocodingService } from './services/geocodingService';
import { VolunteerOpportunity } from './types/volunteer';
import { Coordinates } from './types/location';

// Initialize services
const geolocationService = new GeolocationService();
const geocodingService = new GeocodingService();

// Initialize API adapters on app startup
const initializeAPIServices = () => {
  try {
    // Register API adapters
    apiServiceRegistry.registerService(new VolunteerHubAdapter());
    apiServiceRegistry.registerService(new JustServeAdapter());
    apiServiceRegistry.registerService(new IdealistAdapter());
    
    console.log('[App] API services initialized successfully');
  } catch (error) {
    console.error('[App] Failed to initialize API services:', error);
  }
};

const causes = [
  "Human Rights",
  "Animals",
  "Arts & Culture", 
  "Children & Youth",
  "Technology",
  "Education",
  "Health & Medicine",
  "Disaster Assistance",
  "Employment",
  "Environment",
  "Homelessness",
  "Hunger"
];

function App() {
  const [searchLocation, setSearchLocation] = useState('');
  const [searchRadius, setSearchRadius] = useState(25); // Default to 25 miles
  const [selectedCauses, setSelectedCauses] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'distance' | 'date' | 'relevance'>('distance');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  // New state for real API integration
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | MultiLocationSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<Coordinates | null>(null);
  const [servicesInitialized, setServicesInitialized] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isMultiLocationSearch, setIsMultiLocationSearch] = useState(false);
  
  // Enhanced loading states for real-time search
  const [searchProgress, setSearchProgress] = useState<{
    isSearching: boolean;
    currentStep: string;
    sourcesQueried: number;
    totalSources: number;
    completedSources: string[];
    failedSources: string[];
  }>({
    isSearching: false,
    currentStep: '',
    sourcesQueried: 0,
    totalSources: 0,
    completedSources: [],
    failedSources: []
  });

  // Initialize API services and load preferences on app startup
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize API services
        initializeAPIServices();
        setServicesInitialized(true);
        
        // Load preferences
        const savedPreferences = searchController.loadSearchPreferences();
        if (savedPreferences) {
          // Pre-populate location field with saved preferences
          if (savedPreferences.lastLocation) {
            const locationText = savedPreferences.lastLocation.state 
              ? `${savedPreferences.lastLocation.city}, ${savedPreferences.lastLocation.state}, ${savedPreferences.lastLocation.country}`
              : `${savedPreferences.lastLocation.city}, ${savedPreferences.lastLocation.country}`;
            setSearchLocation(locationText);
          }
          
          // Set other preferences
          setSearchRadius(savedPreferences.preferredRadius);
          setSelectedCauses(savedPreferences.preferredCauses);
          setSelectedType(savedPreferences.preferredType);
          
          console.log('[App] Loaded search preferences:', savedPreferences);
        }
      } catch (error) {
        console.error('[App] Failed to initialize app:', error);
      } finally {
        setPreferencesLoaded(true);
      }
    };

    initializeApp();
  }, []);

  // Save preferences when search parameters change (after initial load)
  useEffect(() => {
    if (preferencesLoaded && searchLocation.trim()) {
      saveCurrentPreferences();
    }
  }, [searchRadius, selectedCauses, selectedType, preferencesLoaded]);

  // Filter and sort opportunities from API results
  const filteredOpportunities = useMemo(() => {
    if (!opportunities.length) {
      return [];
    }

    let filtered = opportunities.filter(opportunity => {
      const matchesCause = selectedCauses.length === 0 || 
        selectedCauses.includes(opportunity.cause);
      
      const matchesType = selectedType === '' || 
        selectedType === 'both' || 
        opportunity.type === selectedType;
      
      // Filter by distance radius for in-person opportunities
      const matchesRadius = opportunity.type === 'virtual' || 
        !opportunity.distance || 
        opportunity.distance <= searchRadius;
      
      return matchesCause && matchesType && matchesRadius;
    });

    // Sort the filtered results
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'distance':
          // Virtual opportunities go to the end, then sort by distance
          if (a.type === 'virtual' && b.type !== 'virtual') return 1;
          if (b.type === 'virtual' && a.type !== 'virtual') return -1;
          if (a.type === 'virtual' && b.type === 'virtual') return 0;
          return (a.distance || 0) - (b.distance || 0);
        case 'date':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'relevance':
        default:
          return 0; // Keep original order for relevance
      }
    });

    return filtered;
  }, [opportunities, selectedCauses, selectedType, searchRadius, sortBy]);

  const handleCauseChange = (cause: string) => {
    setSelectedCauses(prev => 
      prev.includes(cause) 
        ? prev.filter(c => c !== cause)
        : [...prev, cause]
    );
  };

  // Save preferences when user performs successful searches
  const saveCurrentPreferences = () => {
    if (!searchLocation.trim()) return;

    try {
      // Parse location to create LocationInfo
      const locationParts = searchLocation.split(',').map(part => part.trim());
      const locationInfo = {
        city: locationParts[0] || '',
        state: locationParts.length > 2 ? locationParts[1] : undefined,
        country: locationParts[locationParts.length - 1] || '',
        formattedAddress: searchLocation
      };

      const preferences = {
        lastLocation: locationInfo,
        preferredRadius: searchRadius,
        preferredCauses: selectedCauses,
        preferredType: selectedType as 'in-person' | 'virtual' | 'both'
      };

      searchController.saveSearchPreferences(preferences);
      console.log('[App] Saved search preferences');
    } catch (error) {
      console.error('[App] Failed to save preferences:', error);
    }
  };

  // Handle location change and clear preferences if location is cleared
  const handleLocationChange = (newLocation: string) => {
    const previousLocation = searchLocation;
    setSearchLocation(newLocation);

    // Clear preferences when user explicitly clears location
    if (previousLocation && !newLocation.trim()) {
      try {
        searchController.clearSearchPreferences();
        console.log('[App] Cleared search preferences due to location clearing');
      } catch (error) {
        console.error('[App] Failed to clear preferences:', error);
      }
    }
  };

  // Retry failed API sources
  const retryFailedSources = async () => {
    if (!searchResult || !currentCoordinates) {
      return;
    }

    setIsRetrying(true);
    setSearchError(null);

    try {
      const searchParams = {
        location: currentCoordinates,
        radius: searchRadius,
        causes: selectedCauses.length > 0 ? selectedCauses : undefined,
        type: selectedType === '' ? 'both' : selectedType as 'in-person' | 'virtual' | 'both',
        limit: 50
      };

      console.log('[App] Retrying failed sources');
      const retryResult = await searchController.retryFailedSources(searchParams, searchResult);
      
      setSearchResult(retryResult);
      setOpportunities(retryResult.opportunities);
      
      console.log(`[App] Retry completed: ${retryResult.totalResults} total opportunities`);
      
    } catch (error) {
      console.error('[App] Retry failed:', error);
      setSearchError('Retry failed. Please try searching again.');
    } finally {
      setIsRetrying(false);
    }
  };

  // Perform real API search with progress tracking
  const performSearch = async (coordinates: Coordinates) => {
    if (!servicesInitialized) {
      console.warn('[App] Services not initialized yet');
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    
    // Initialize search progress
    setSearchProgress({
      isSearching: true,
      currentStep: 'Initializing search...',
      sourcesQueried: 0,
      totalSources: 3, // VolunteerHub, JustServe, Idealist
      completedSources: [],
      failedSources: []
    });

    try {
      const searchParams = {
        location: coordinates,
        radius: searchRadius,
        causes: selectedCauses.length > 0 ? selectedCauses : undefined,
        type: selectedType === '' ? 'both' : selectedType as 'in-person' | 'virtual' | 'both',
        limit: 50
      };

      console.log('[App] Starting search with params:', searchParams);
      
      // Update progress
      setSearchProgress(prev => ({
        ...prev,
        currentStep: 'Searching volunteer opportunities...',
        sourcesQueried: prev.totalSources
      }));
      
      const result = await searchController.performSearch(searchParams);
      
      // Update progress with results
      setSearchProgress(prev => ({
        ...prev,
        currentStep: 'Processing results...',
        completedSources: result.sources.filter(source => 
          !result.errors?.some(error => error.source === source)
        ),
        failedSources: result.errors?.map(error => error.source) || []
      }));
      
      setSearchResult(result);
      setOpportunities(result.opportunities);
      setCurrentCoordinates(coordinates);
      
      console.log(`[App] Search completed: ${result.totalResults} opportunities found`);
      
      if (result.errors && result.errors.length > 0) {
        console.warn('[App] Search completed with errors:', result.errors);
      }
      
      // Final progress update
      setSearchProgress(prev => ({
        ...prev,
        currentStep: `Found ${result.totalResults} opportunities`,
        isSearching: false
      }));
      
    } catch (error) {
      console.error('[App] Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setOpportunities([]);
      
      // Update progress with error
      setSearchProgress(prev => ({
        ...prev,
        currentStep: 'Search failed',
        isSearching: false,
        failedSources: ['All sources']
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle search button click with multi-location support
  const handleSearch = async () => {
    if (!searchLocation.trim()) {
      setSearchError('Please enter a location to search');
      return;
    }

    try {
      setIsLoading(true);
      setSearchError(null);
      
      // Check if this is a multi-location search
      const multiLocationService = new (await import('./services/MultiLocationService')).MultiLocationService();
      const isMultiLocation = multiLocationService.isMultiLocationInput(searchLocation);
      setIsMultiLocationSearch(isMultiLocation);
      
      // Initialize search progress
      setSearchProgress({
        isSearching: true,
        currentStep: isMultiLocation ? 'Parsing multiple locations...' : 'Initializing search...',
        sourcesQueried: 0,
        totalSources: 3, // VolunteerHub, JustServe, Idealist
        completedSources: [],
        failedSources: []
      });

      // Create search filters
      const filters = {
        causes: selectedCauses,
        type: selectedType === '' ? 'both' : selectedType as 'in-person' | 'virtual' | 'both',
        timeCommitment: undefined,
        skills: undefined
      };

      console.log(`[App] Starting ${isMultiLocation ? 'multi-location' : 'single-location'} search`);
      
      // Use smart search that automatically detects single vs multi-location
      const result = await searchController.performSmartSearch(
        searchLocation,
        searchRadius,
        filters
      );
      
      // Update progress
      setSearchProgress(prev => ({
        ...prev,
        currentStep: 'Processing results...',
        sourcesQueried: prev.totalSources,
        completedSources: result.sources.filter(source => 
          !result.errors?.some(error => error.source === source)
        ),
        failedSources: result.errors?.map(error => error.source) || []
      }));
      
      setSearchResult(result);
      setOpportunities(result.opportunities);
      
      // For single location searches, store coordinates for retry functionality
      if (!isMultiLocation && 'searchLocation' in result && result.searchLocation) {
        try {
          const coordinates = await geocodingService.geocodeLocation(searchLocation);
          setCurrentCoordinates(coordinates);
        } catch (error) {
          console.warn('[App] Failed to store coordinates for retry:', error);
        }
      }
      
      console.log(`[App] Search completed: ${result.totalResults} opportunities found`);
      
      if (result.errors && result.errors.length > 0) {
        console.warn('[App] Search completed with errors:', result.errors);
      }
      
      // Final progress update with location-specific messaging
      const finalMessage = isMultiLocation && 'searchStatistics' in result
        ? `Found ${result.totalResults} opportunities across ${result.searchStatistics?.successfulLocations} locations`
        : `Found ${result.totalResults} opportunities`;
        
      setSearchProgress(prev => ({
        ...prev,
        currentStep: finalMessage,
        isSearching: false
      }));
      
      // Save preferences when user performs a search
      saveCurrentPreferences();
      
    } catch (error) {
      console.error('[App] Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setOpportunities([]);
      
      // Update progress with error
      setSearchProgress(prev => ({
        ...prev,
        currentStep: 'Search failed',
        isSearching: false,
        failedSources: ['All sources']
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle geolocation button click
  const handleUseCurrentLocation = async () => {
    try {
      setIsLoading(true);
      setSearchError(null);
      
      const geolocationResult = await geolocationService.getCurrentLocationWithFallback();
      
      if (!geolocationResult) {
        setSearchError('Unable to get your current location. Please enter a location manually.');
        setIsLoading(false);
        return;
      }
      
      // Update location field with reverse geocoded address
      try {
        const locationInfo = await geocodingService.reverseGeocode(geolocationResult.coordinates);
        const locationText = locationInfo.state 
          ? `${locationInfo.city}, ${locationInfo.state}, ${locationInfo.country}`
          : `${locationInfo.city}, ${locationInfo.country}`;
        setSearchLocation(locationText);
      } catch (reverseGeocodeError) {
        console.warn('[App] Reverse geocoding failed, using coordinates:', reverseGeocodeError);
        setSearchLocation(`${geolocationResult.coordinates.latitude.toFixed(4)}, ${geolocationResult.coordinates.longitude.toFixed(4)}`);
      }
      
      // Perform search with current location
      await performSearch(geolocationResult.coordinates);
      
    } catch (error) {
      console.error('[App] Geolocation failed:', error);
      setSearchError('Unable to access your location. Please check your browser permissions and try again.');
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setSelectedCauses([]);
    setSelectedType('');
    setSearchRadius(25); // Reset to default radius
    setSortBy('distance'); // Reset to default sort
    
    // Clear preferences when filters are cleared
    try {
      searchController.clearSearchPreferences();
      console.log('[App] Cleared search preferences due to filter clearing');
    } catch (error) {
      console.error('[App] Failed to clear preferences:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Heart className="h-8 w-8 text-blue-600 mr-2" />
              <h1 className="text-2xl font-bold text-gray-900">VolunteerManiac</h1>
            </div>
            <nav className="hidden md:flex space-x-8">
              <a href="#" className="text-gray-700 hover:text-blue-600 transition-colors">Find Opportunities</a>
              <a href="#" className="text-gray-700 hover:text-blue-600 transition-colors">For Organizations</a>
              <a href="#" className="text-gray-700 hover:text-blue-600 transition-colors">About</a>
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Sign Up
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Make a Difference in Your Community
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Connect with meaningful volunteer opportunities and create positive change
          </p>
          
          {/* Search Box */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-4 bg-white rounded-lg p-2 shadow-lg">
              <div className="flex-1 flex gap-2">
                <LocationInput
                  value={searchLocation}
                  onChange={handleLocationChange}
                  placeholder="Enter city, country (or multiple cities separated by commas)"
                  className="flex-1"
                  geocodingService={geocodingService}
                />
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={isLoading}
                  className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Use my current location"
                >
                  <MapPin className="h-5 w-5" />
                </button>
              </div>
              <button 
                onClick={handleSearch}
                disabled={isLoading || !searchLocation.trim()}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
            
            {/* Enhanced Error Display */}
            {searchError && (
              <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-red-800">Search Failed</h3>
                    <p className="mt-1 text-sm text-red-700">{searchError}</p>
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          if (currentCoordinates) {
                            performSearch(currentCoordinates);
                          } else if (searchLocation.trim()) {
                            handleSearch();
                          }
                        }}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API Error Display */}
            {searchResult && searchResult.errors && searchResult.errors.length > 0 && (
              <ErrorDisplay
                errors={searchResult.errors}
                serviceStatuses={searchResult.serviceStatuses}
                partialResults={searchResult.partialResults}
                totalResults={searchResult.totalResults}
                onRetry={retryFailedSources}
                isRetrying={isRetrying}
                className="mt-4"
              />
            )}
            
            {/* Enhanced Search Results Summary */}
            {searchResult && !isLoading && (
              <div className="mt-4 text-center text-white/90">
                <p className="text-lg font-medium">
                  {'searchStatistics' in searchResult && searchResult.searchStatistics ? (
                    <>
                      Found {searchResult.totalResults} opportunities across {searchResult.searchStatistics.successfulLocations} locations from {searchResult.sources.length} sources
                      {searchResult.responseTime && ` in ${(searchResult.responseTime / 1000).toFixed(1)}s`}
                    </>
                  ) : (
                    <>
                      Found {searchResult.totalResults} opportunities from {searchResult.sources.length} sources
                      {searchResult.responseTime && ` in ${(searchResult.responseTime / 1000).toFixed(1)}s`}
                    </>
                  )}
                </p>
                
                {/* Source Status Summary */}
                <div className="flex flex-wrap justify-center gap-2 mt-2 text-xs">
                  {searchResult.sources.map(source => {
                    const hasError = searchResult.errors?.some(error => error.source === source);
                    return (
                      <span 
                        key={source} 
                        className={`px-2 py-1 rounded ${
                          hasError 
                            ? 'bg-yellow-200 text-yellow-800' 
                            : 'bg-green-200 text-green-800'
                        }`}
                      >
                        {hasError ? '⚠' : '✓'} {source}
                      </span>
                    );
                  })}
                </div>
                
                {searchResult.errors && searchResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-yellow-200 text-sm">
                      {searchResult.errors.length} source(s) had issues
                    </p>
                    <details className="text-xs text-yellow-100 mt-1">
                      <summary className="cursor-pointer hover:text-white">View details</summary>
                      <div className="mt-1 space-y-1">
                        {searchResult.errors.map((error, index) => (
                          <p key={index}>
                            {error.source}: {error.message}
                          </p>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <div className="lg:w-1/4">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className="lg:hidden"
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>
              
              <div className={`space-y-6 ${showFilters ? 'block' : 'hidden lg:block'}`}>
                {/* Distance Radius */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Search Radius</h3>
                  <DistanceRadiusSelector
                    value={searchRadius}
                    onChange={setSearchRadius}
                    disabled={!searchLocation.trim()}
                  />
                </div>

                {/* Sort Options */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Sort By</h3>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="sort"
                        value="distance"
                        checked={sortBy === 'distance'}
                        onChange={(e) => setSortBy(e.target.value as 'distance')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-gray-700">Distance</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="sort"
                        value="date"
                        checked={sortBy === 'date'}
                        onChange={(e) => setSortBy(e.target.value as 'date')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-gray-700">Date</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="sort"
                        value="relevance"
                        checked={sortBy === 'relevance'}
                        onChange={(e) => setSortBy(e.target.value as 'relevance')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-gray-700">Relevance</span>
                    </label>
                  </div>
                </div>

                {/* Opportunity Type */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Opportunity Type</h3>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value=""
                        checked={selectedType === ''}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-gray-700">All</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="in-person"
                        checked={selectedType === 'in-person'}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-gray-700">In Person</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="virtual"
                        checked={selectedType === 'virtual'}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-gray-700">Virtual</span>
                    </label>
                  </div>
                </div>

                {/* Causes */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Causes</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {causes.map(cause => (
                      <label key={cause} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedCauses.includes(cause)}
                          onChange={() => handleCauseChange(cause)}
                          className="text-blue-600 focus:ring-blue-500 rounded"
                        />
                        <span className="ml-2 text-gray-700">{cause}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {(selectedCauses.length > 0 || selectedType || searchRadius !== 25 || sortBy !== 'distance') && (
                  <button
                    onClick={clearFilters}
                    className="w-full text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:w-3/4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {isLoading ? searchProgress.currentStep : (
                    searchResult && 'searchStatistics' in searchResult && searchResult.searchStatistics
                      ? `${filteredOpportunities.length} Volunteer Opportunities (Multi-Location Search)`
                      : `${filteredOpportunities.length} Volunteer Opportunities`
                  )}
                </h2>
                {searchResult && !isLoading && (
                  <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                    <span>
                      {'searchStatistics' in searchResult && searchResult.searchStatistics
                        ? `Searched ${searchResult.searchStatistics.totalLocations} locations across ${searchResult.sources.length} sources`
                        : `Searched ${searchResult.sources.length} sources`
                      }
                    </span>
                    {searchResult.responseTime && (
                      <span>
                        • {(searchResult.responseTime / 1000).toFixed(1)}s response time
                      </span>
                    )}
                    {searchResult.errors && searchResult.errors.length > 0 && (
                      <span className="text-yellow-600">
                        • {searchResult.errors.length} source(s) had issues
                      </span>
                    )}
                  </div>
                )}
              </div>
              {!isLoading && filteredOpportunities.length > 0 && (
                <div className="flex items-center space-x-2">
                  <label htmlFor="sort-by" className="text-sm font-medium text-gray-700">
                    Sort by:
                  </label>
                  <select
                    id="sort-by"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'distance' | 'date' | 'relevance')}
                    className="block pl-3 pr-8 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  >
                    <option value="distance">Distance</option>
                    <option value="date">Date</option>
                    <option value="relevance">Relevance</option>
                  </select>
                </div>
              )}
            </div>

            {/* Enhanced Loading State with Progress */}
            {isLoading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchProgress.currentStep}
                </h3>
                
                {/* Progress Bar */}
                {searchProgress.isSearching && searchProgress.totalSources > 0 && (
                  <div className="max-w-md mx-auto mb-4">
                    <div className="bg-gray-200 rounded-full h-2 mb-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${((searchProgress.completedSources.length + searchProgress.failedSources.length) / searchProgress.totalSources) * 100}%` 
                        }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-600">
                      Searching {searchProgress.sourcesQueried} sources...
                    </p>
                  </div>
                )}
                
                {/* Source Status */}
                {searchProgress.isSearching && (searchProgress.completedSources.length > 0 || searchProgress.failedSources.length > 0) && (
                  <div className="max-w-md mx-auto">
                    <div className="flex flex-wrap justify-center gap-2 text-xs">
                      {searchProgress.completedSources.map(source => (
                        <span key={source} className="bg-green-100 text-green-800 px-2 py-1 rounded">
                          ✓ {source}
                        </span>
                      ))}
                      {searchProgress.failedSources.map(source => (
                        <span key={source} className="bg-red-100 text-red-800 px-2 py-1 rounded">
                          ✗ {source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {!searchProgress.isSearching && (
                  <p className="text-gray-600">Processing results...</p>
                )}
              </div>
            )}

            {/* Multi-Location Results */}
            {!isLoading && searchResult && 'locationGroups' in searchResult && searchResult.locationGroups && searchResult.searchStatistics && (
              <MultiLocationResults
                locationGroups={searchResult.locationGroups}
                searchStatistics={searchResult.searchStatistics}
                className="mb-8"
              />
            )}

            {/* Regular Results Grid (for single location searches) */}
            {!isLoading && filteredOpportunities.length > 0 && !(searchResult && 'locationGroups' in searchResult && searchResult.locationGroups) && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {filteredOpportunities.map(opportunity => (
                  <div 
                    key={opportunity.id}
                    className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    {opportunity.image && (
                      <img 
                        src={opportunity.image}
                        alt={opportunity.title}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                          // Hide image if it fails to load
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-gray-900 mb-1">
                            {opportunity.title}
                          </h3>
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
            )}

            {/* Empty State */}
            {!isLoading && filteredOpportunities.length === 0 && opportunities.length === 0 && !searchResult && (
              <div className="text-center py-12">
                <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to find volunteer opportunities?</h3>
                <p className="text-gray-600">Enter a location above to search for meaningful volunteer opportunities in your area</p>
              </div>
            )}

            {/* No Results After Search */}
            {!isLoading && filteredOpportunities.length === 0 && opportunities.length > 0 && (
              <div className="text-center py-12">
                <Filter className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities match your filters</h3>
                <p className="text-gray-600">Try adjusting your search criteria or expanding your search radius</p>
              </div>
            )}

            {/* Enhanced No Results From Search */}
            {!isLoading && opportunities.length === 0 && searchResult && (
              <div className="text-center py-12">
                <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found in this area</h3>
                
                <div className="max-w-md mx-auto space-y-3">
                  <p className="text-gray-600">
                    We searched {searchResult.sources.length} volunteer databases but couldn't find opportunities matching your criteria.
                  </p>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                    <h4 className="font-medium text-blue-900 mb-2">Try these suggestions:</h4>
                    <ul className="text-blue-800 space-y-1 text-left">
                      <li>• Expand your search radius to {searchRadius + 25} miles</li>
                      <li>• Remove some cause filters to see more opportunities</li>
                      <li>• Try searching in a nearby city</li>
                      <li>• Include virtual opportunities in your search</li>
                    </ul>
                  </div>
                  
                  {searchResult.errors && searchResult.errors.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
                      <p className="text-yellow-800">
                        <strong>Note:</strong> {searchResult.errors.length} of {searchResult.sources.length} sources were unavailable. 
                        More opportunities might be available when all sources are working.
                      </p>
                    </div>
                  )}
                  
                  {searchResult.responseTime && searchResult.responseTime > 10000 && (
                    <p className="text-xs text-gray-500">
                      Search took {(searchResult.responseTime / 1000).toFixed(1)}s - some sources may have timed out
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Heart className="h-6 w-6 text-blue-400 mr-2" />
                <h3 className="text-lg font-semibold">VolunteerManiac</h3>
              </div>
              <p className="text-gray-400">
                Connecting passionate volunteers with meaningful opportunities to create positive change.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">For Volunteers</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Find Opportunities</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Create Profile</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Track Impact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">For Organizations</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Post Opportunities</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Manage Volunteers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Resources</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 VolunteerManiac. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;