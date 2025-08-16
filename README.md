# VolunteerManiac - Location-Based Volunteer Search Platform

A comprehensive React-based web application that helps users discover volunteer opportunities across multiple platforms using intelligent location-based search, multi-location support, and advanced filtering capabilities.

## 🌟 Features

### Core Search Capabilities
- **Multi-Location Search**: Search for volunteer opportunities across multiple cities simultaneously
- **Intelligent Location Detection**: Automatic geolocation with fallback mechanisms
- **Cross-Platform Integration**: Aggregates opportunities from multiple volunteer platforms (VolunteerHub, JustServe, Idealist)
- **Advanced Filtering**: Filter by cause, type (in-person/virtual), skills, and time commitment
- **Distance-Based Results**: Automatically calculates and sorts opportunities by distance

### Smart Search Features
- **Auto-Complete Location Suggestions**: Real-time location suggestions as you type
- **Geocoding & Reverse Geocoding**: Convert between addresses and coordinates
- **Caching System**: Intelligent caching for improved performance and reduced API calls
- **Rate Limiting**: Respectful API usage with built-in rate limiting
- **Error Recovery**: Comprehensive error handling with user-friendly messages and suggestions

### User Experience
- **Responsive Design**: Mobile-first design using Tailwind CSS
- **Real-Time Search Progress**: Visual feedback during multi-source searches
- **Search Preferences**: Save and restore user search preferences
- **Accessibility**: Built with accessibility best practices
- **Performance Optimized**: Lazy loading, caching, and optimized rendering

### Technical Features
- **TypeScript**: Full type safety throughout the application
- **Comprehensive Testing**: Unit, integration, and performance tests
- **Modular Architecture**: Clean separation of concerns with service-oriented design
- **API Abstraction**: Unified interface for multiple volunteer platforms
- **Health Monitoring**: Real-time API health checks and service status monitoring

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd volunteermania
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # API Configuration (Optional - uses mock data if not provided)
   VITE_VOLUNTEERHUB_API_URL=https://api.volunteerhub.com/v1
   VITE_VOLUNTEERHUB_API_KEY=your_api_key_here
   
   VITE_JUSTSERVE_API_URL=https://api.justserve.org/v2
   VITE_JUSTSERVE_API_KEY=your_api_key_here
   
   VITE_IDEALIST_API_URL=https://www.idealist.org/api/v1
   VITE_IDEALIST_API_KEY=your_api_key_here
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## 🧪 Testing

### Run All Tests
```bash
npm run test:all
```

### Individual Test Suites
```bash
# Unit tests (watch mode)
npm run test

# Unit tests (single run)
npm run test:run

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance

# Performance test report
npm run test:performance:report

# Test UI (interactive)
npm run test:ui
```

### Test Coverage
The application includes comprehensive test coverage:
- **Unit Tests**: Component and service testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Load testing and memory usage analysis
- **API Tests**: Mock API adapter testing

## 🏗️ Architecture

### Project Structure
```
src/
├── components/           # React components
│   ├── __tests__/       # Component tests
│   ├── LocationInput.tsx
│   ├── MultiLocationResults.tsx
│   ├── ErrorDisplay.tsx
│   └── DistanceRadiusSelector.tsx
├── services/            # Business logic services
│   ├── api/            # API integration layer
│   │   ├── adapters/   # Platform-specific adapters
│   │   ├── BaseAPIService.ts
│   │   ├── APIServiceRegistry.ts
│   │   └── RateLimiter.ts
│   ├── SearchController.ts
│   ├── MultiLocationService.ts
│   ├── ResultsProcessor.ts
│   ├── FilteringSortingService.ts
│   ├── SearchResultsCache.ts
│   ├── geocodingService.ts
│   └── geolocationService.ts
├── types/              # TypeScript type definitions
│   ├── volunteer.ts
│   └── location.ts
├── utils/              # Utility functions
│   └── distanceCalculator.ts
├── config/             # Configuration
│   └── apiConfig.ts
└── __tests__/          # Integration and performance tests
```

### Key Services

#### SearchController
Central orchestrator for all search operations:
- Manages multi-location and single-location searches
- Coordinates API calls across multiple services
- Handles caching and error recovery
- Provides search statistics and health monitoring

#### MultiLocationService
Specialized service for multi-location searches:
- Parses and validates location input
- Geocodes multiple locations in parallel
- Groups and merges results by location
- Provides location-specific statistics

#### API Service Registry
Manages multiple volunteer platform integrations:
- **VolunteerHub Adapter**: Community-focused opportunities
- **JustServe Adapter**: Faith-based and community service
- **Idealist Adapter**: Social impact and nonprofit opportunities
- Health monitoring and failover capabilities
- Rate limiting and retry logic

#### Results Processor
Advanced result processing and enhancement:
- Deduplication across multiple sources
- Distance calculation and sorting
- Data enrichment and normalization
- Quality scoring and verification

## 🔧 Configuration

### API Configuration
The application supports multiple volunteer platforms. Configure API endpoints and keys in `src/config/apiConfig.ts` or via environment variables.

### Rate Limiting
Each API service has configurable rate limits:
```typescript
rateLimit: {
  requestsPerMinute: 60,
  requestsPerHour: 1000
}
```

### Caching
Intelligent caching system with configurable TTL:
- Search results: 10 minutes
- Geocoding results: 24 hours
- Location suggestions: 1 hour

### Retry Configuration
Configurable retry logic for failed requests:
```typescript
retryConfig: {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
}
```

## 🌐 API Integration

### Supported Platforms
1. **VolunteerHub**: Community volunteer opportunities
2. **JustServe**: Faith-based and community service
3. **Idealist**: Social impact and nonprofit opportunities

### Adding New Platforms
To integrate a new volunteer platform:

1. Create a new adapter extending `BaseAPIService`
2. Implement required methods:
   ```typescript
   class NewPlatformAdapter extends BaseAPIService {
     async searchOpportunities(params: SearchParameters): Promise<APIResult>
     async getOpportunityDetails(id: string): Promise<VolunteerOpportunity>
     protected normalizeOpportunity(rawData: any): VolunteerOpportunity
   }
   ```
3. Register the adapter in `APIServiceRegistry`
4. Add configuration in `apiConfig.ts`

## 📱 Usage Examples

### Basic Search
```typescript
import { searchController } from './services/SearchController';

// Simple location search
const results = await searchController.performSearch({
  location: { latitude: 40.7128, longitude: -74.0060 },
  radius: 25,
  causes: ['environment', 'education'],
  type: 'both'
});
```

### Multi-Location Search
```typescript
// Search multiple cities
const results = await searchController.performMultiLocationSearch(
  'New York, Los Angeles, Chicago',
  25,
  { causes: ['environment'], type: 'in-person' }
);
```

### Smart Search (Auto-Detection)
```typescript
// Automatically detects single vs multi-location
const results = await searchController.performSmartSearch(
  'San Francisco, Seattle',
  30,
  { causes: ['technology'], type: 'both' }
);
```

## 🔍 Advanced Features

### Search Preferences
Users can save and restore search preferences:
```typescript
// Save preferences
searchController.saveSearchPreferences({
  lastLocation: { city: 'New York', country: 'USA' },
  preferredRadius: 25,
  preferredCauses: ['environment', 'education'],
  preferredType: 'both'
});

// Load preferences
const preferences = searchController.loadSearchPreferences();
```

### Cache Management
```typescript
// Get cache statistics
const stats = searchController.getCacheStats();

// Clear cache
searchController.clearCache();

// Warm cache with popular locations
await searchController.warmCache([
  { coordinates: { latitude: 40.7128, longitude: -74.0060 }, radius: 25 }
]);
```

### Health Monitoring
```typescript
// Check service connectivity
const connectivity = await searchController.testConnectivity();

// Get detailed service status
const serviceStatus = await searchController.getDetailedServiceStatus();
```

## 🎨 Styling

The application uses Tailwind CSS for styling with a mobile-first approach. Key design principles:

- **Responsive Design**: Optimized for mobile, tablet, and desktop
- **Accessibility**: WCAG 2.1 AA compliant
- **Performance**: Optimized CSS with minimal bundle size
- **Consistency**: Design system with reusable components

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Environment Variables for Production
Ensure all required environment variables are set in your deployment environment:
- API keys for volunteer platforms
- Any custom configuration overrides

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm run test:all`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines
- Write comprehensive tests for new features
- Follow TypeScript best practices
- Maintain consistent code style (ESLint configuration provided)
- Update documentation for API changes
- Ensure accessibility compliance

## 📊 Performance

The application is optimized for performance:
- **Bundle Size**: Optimized with tree shaking and code splitting
- **Caching**: Multi-level caching strategy
- **API Efficiency**: Rate limiting and request deduplication
- **Rendering**: Optimized React rendering with proper memoization

### Performance Monitoring
Run performance tests to monitor:
- Search response times
- Memory usage
- Cache hit rates
- API success rates

## 🐛 Troubleshooting

### Common Issues

**Location not detected**
- Ensure location permissions are granted
- Check if HTTPS is enabled (required for geolocation)
- Try manual location entry

**API errors**
- Verify API keys are correctly configured
- Check network connectivity
- Review rate limiting status

**Search returns no results**
- Try broader search criteria
- Increase search radius
- Check if services are healthy

### Debug Mode
Enable debug logging by setting:
```env
NODE_ENV=development
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenStreetMap Nominatim for geocoding services
- Volunteer platform APIs for opportunity data
- React and TypeScript communities for excellent tooling
- Tailwind CSS for the utility-first CSS framework

---

**VolunteerManiac** - Connecting volunteers with meaningful opportunities through intelligent location-based search.