import { VolunteerOpportunity, APIResult } from '../types/volunteer';
import { Coordinates } from '../types/location';
import { calculateDistance } from '../utils/distanceCalculator';

export interface ProcessingOptions {
  enableDeduplication?: boolean;
  enableDistanceCalculation?: boolean;
  enableDataEnrichment?: boolean;
  maxDistance?: number; // in miles
}

export interface ProcessingStats {
  originalCount: number;
  duplicatesRemoved: number;
  enrichedCount: number;
  finalCount: number;
  processingTime: number;
}

export class ResultsProcessor {
  private defaultOptions: ProcessingOptions = {
    enableDeduplication: true,
    enableDistanceCalculation: true,
    enableDataEnrichment: true,
    maxDistance: 100
  };

  /**
   * Process results from multiple API sources
   */
  async processResults(
    results: APIResult[],
    searchLocation: Coordinates,
    options: ProcessingOptions = {}
  ): Promise<{ opportunities: VolunteerOpportunity[]; stats: ProcessingStats }> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    console.log('[ResultsProcessor] Starting results processing', {
      resultSources: results.length,
      searchLocation,
      options: opts
    });

    // Extract all opportunities from successful results
    let allOpportunities: VolunteerOpportunity[] = [];
    for (const result of results) {
      if (result.success && result.opportunities.length > 0) {
        allOpportunities.push(...result.opportunities);
      }
    }

    const originalCount = allOpportunities.length;
    console.log(`[ResultsProcessor] Extracted ${originalCount} opportunities from ${results.length} sources`);

    // Step 1: Calculate distances if enabled
    if (opts.enableDistanceCalculation) {
      allOpportunities = this.calculateDistances(allOpportunities, searchLocation);
      console.log('[ResultsProcessor] Distance calculation completed');
    }

    // Step 2: Filter by maximum distance if specified
    if (opts.maxDistance && opts.enableDistanceCalculation) {
      allOpportunities = allOpportunities.filter(opp => 
        opp.type === 'virtual' || (opp.distance !== undefined && opp.distance <= opts.maxDistance!)
      );
      console.log(`[ResultsProcessor] Filtered to ${allOpportunities.length} opportunities within ${opts.maxDistance} miles`);
    }

    // Step 3: Deduplicate if enabled
    let duplicatesRemoved = 0;
    if (opts.enableDeduplication) {
      const beforeDedup = allOpportunities.length;
      allOpportunities = this.deduplicateOpportunities(allOpportunities);
      duplicatesRemoved = beforeDedup - allOpportunities.length;
      console.log(`[ResultsProcessor] Removed ${duplicatesRemoved} duplicate opportunities`);
    }

    // Step 4: Enrich data if enabled
    let enrichedCount = 0;
    if (opts.enableDataEnrichment) {
      const beforeEnrich = allOpportunities.length;
      allOpportunities = this.enrichOpportunityData(allOpportunities);
      enrichedCount = allOpportunities.length - beforeEnrich;
      console.log(`[ResultsProcessor] Enriched ${enrichedCount} opportunities`);
    }

    // Step 5: Sort by distance (closest first)
    if (opts.enableDistanceCalculation) {
      allOpportunities = this.sortByDistance(allOpportunities);
      console.log('[ResultsProcessor] Sorted opportunities by distance');
    }

    const processingTime = Date.now() - startTime;
    const stats: ProcessingStats = {
      originalCount,
      duplicatesRemoved,
      enrichedCount,
      finalCount: allOpportunities.length,
      processingTime
    };

    console.log('[ResultsProcessor] Processing completed', stats);

    return { opportunities: allOpportunities, stats };
  }

  /**
   * Remove duplicate opportunities using title and organization matching
   */
  deduplicateOpportunities(opportunities: VolunteerOpportunity[]): VolunteerOpportunity[] {
    const seen = new Map<string, VolunteerOpportunity>();
    const duplicates: VolunteerOpportunity[] = [];

    for (const opportunity of opportunities) {
      const key = this.generateDeduplicationKey(opportunity);
      
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        // Keep the opportunity with more complete data or from a more reliable source
        const better = this.selectBetterOpportunity(existing, opportunity);
        seen.set(key, better);
        duplicates.push(better === existing ? opportunity : existing);
      } else {
        seen.set(key, opportunity);
      }
    }

    console.log(`[ResultsProcessor] Deduplication: ${opportunities.length} -> ${seen.size} (removed ${duplicates.length})`);
    return Array.from(seen.values());
  }

  /**
   * Generate a key for deduplication based on title and organization
   */
  private generateDeduplicationKey(opportunity: VolunteerOpportunity): string {
    // Normalize title and organization for comparison
    const normalizedTitle = this.normalizeString(opportunity.title);
    const normalizedOrg = this.normalizeString(opportunity.organization);
    const normalizedLocation = this.normalizeString(opportunity.location);
    
    return `${normalizedTitle}|${normalizedOrg}|${normalizedLocation}`;
  }

  /**
   * Normalize string for comparison (remove extra spaces, convert to lowercase, etc.)
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, ''); // Remove special characters
  }

  /**
   * Select the better opportunity between two duplicates
   */
  private selectBetterOpportunity(
    existing: VolunteerOpportunity,
    candidate: VolunteerOpportunity
  ): VolunteerOpportunity {
    // Scoring system to determine which opportunity is better
    const existingScore = this.scoreOpportunity(existing);
    const candidateScore = this.scoreOpportunity(candidate);
    
    return candidateScore > existingScore ? candidate : existing;
  }

  /**
   * Score an opportunity based on data completeness and source reliability
   */
  private scoreOpportunity(opportunity: VolunteerOpportunity): number {
    let score = 0;
    
    // Data completeness scoring
    if (opportunity.description && opportunity.description.length > 50) score += 2;
    if (opportunity.contactInfo.email) score += 1;
    if (opportunity.contactInfo.phone) score += 1;
    if (opportunity.contactInfo.website) score += 1;
    if (opportunity.coordinates) score += 1;
    if (opportunity.skills && opportunity.skills.length > 0) score += 1;
    if (opportunity.image) score += 1;
    if (opportunity.verified) score += 2;
    if (opportunity.applicationDeadline) score += 1;
    
    // Source reliability (can be customized based on API reliability)
    const sourceReliability: { [key: string]: number } = {
      'VolunteerHub': 3,
      'JustServe': 2,
      'Idealist': 2,
      'default': 1
    };
    
    score += sourceReliability[opportunity.source] || sourceReliability['default'];
    
    return score;
  }

  /**
   * Calculate distances from search location for all opportunities
   */
  calculateDistances(
    opportunities: VolunteerOpportunity[],
    searchLocation: Coordinates
  ): VolunteerOpportunity[] {
    return opportunities.map(opportunity => {
      if (opportunity.type === 'virtual') {
        // Virtual opportunities don't have distance
        return { ...opportunity, distance: undefined };
      }
      
      if (opportunity.coordinates) {
        const distance = calculateDistance(
          searchLocation,
          opportunity.coordinates
        );
        return { ...opportunity, distance: Math.round(distance * 10) / 10 }; // Round to 1 decimal
      }
      
      // If no coordinates, try to estimate from city/location string
      // This would require geocoding, for now we'll leave distance undefined
      return opportunity;
    });
  }

  /**
   * Sort opportunities by distance (closest first)
   */
  sortByDistance(opportunities: VolunteerOpportunity[]): VolunteerOpportunity[] {
    return opportunities.sort((a, b) => {
      // Virtual opportunities come first
      if (a.type === 'virtual' && b.type !== 'virtual') return -1;
      if (b.type === 'virtual' && a.type !== 'virtual') return 1;
      
      // If both virtual, sort by other criteria (e.g., date, title)
      if (a.type === 'virtual' && b.type === 'virtual') {
        return a.title.localeCompare(b.title);
      }
      
      // Sort by distance for in-person opportunities
      const distanceA = a.distance ?? Infinity;
      const distanceB = b.distance ?? Infinity;
      
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      
      // If distances are equal, sort by title
      return a.title.localeCompare(b.title);
    });
  }

  /**
   * Enrich opportunity data by filling in missing fields
   */
  private enrichOpportunityData(opportunities: VolunteerOpportunity[]): VolunteerOpportunity[] {
    return opportunities.map(opportunity => {
      const enriched = { ...opportunity };
      
      // Enrich missing fields with defaults or derived values
      if (!enriched.skills || enriched.skills.length === 0) {
        enriched.skills = this.inferSkillsFromDescription(enriched.description, enriched.cause);
      }
      
      if (!enriched.timeCommitment || enriched.timeCommitment.trim() === '') {
        enriched.timeCommitment = 'Time commitment not specified';
      }
      
      if (!enriched.participants) {
        enriched.participants = this.estimateParticipantsNeeded(enriched.description);
      }
      
      // Ensure required fields have sensible defaults
      if (!enriched.image) {
        enriched.image = this.getDefaultImageForCause(enriched.cause);
      }
      
      // Update lastUpdated to current time if not set
      if (!enriched.lastUpdated) {
        enriched.lastUpdated = new Date();
      }
      
      return enriched;
    });
  }

  /**
   * Infer skills from description and cause
   */
  private inferSkillsFromDescription(description: string, cause: string): string[] {
    const skills: string[] = [];
    const lowerDesc = description.toLowerCase();
    const lowerCause = cause.toLowerCase();
    
    // Common skill keywords
    const skillKeywords = {
      'communication': ['communication', 'speaking', 'presentation', 'outreach'],
      'teamwork': ['team', 'group', 'collaborate', 'together'],
      'leadership': ['lead', 'manage', 'coordinate', 'organize'],
      'physical': ['physical', 'lifting', 'outdoor', 'manual', 'construction'],
      'technical': ['computer', 'technical', 'software', 'website', 'digital'],
      'teaching': ['teach', 'tutor', 'education', 'mentor', 'training'],
      'creative': ['creative', 'art', 'design', 'music', 'writing']
    };
    
    // Check description for skill keywords
    for (const [skill, keywords] of Object.entries(skillKeywords)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        skills.push(skill);
      }
    }
    
    // Add cause-specific skills
    const causeSkills: { [key: string]: string[] } = {
      'environment': ['environmental awareness', 'outdoor activities'],
      'education': ['teaching', 'mentoring'],
      'health': ['healthcare support', 'empathy'],
      'community': ['community engagement', 'social skills'],
      'animals': ['animal care', 'compassion']
    };
    
    if (causeSkills[lowerCause]) {
      skills.push(...causeSkills[lowerCause]);
    }
    
    // Return unique skills or default
    const uniqueSkills = [...new Set(skills)];
    return uniqueSkills.length > 0 ? uniqueSkills : ['general volunteering'];
  }

  /**
   * Estimate participants needed based on description
   */
  private estimateParticipantsNeeded(description: string): number {
    const lowerDesc = description.toLowerCase();
    
    // Look for explicit numbers
    const numberMatch = lowerDesc.match(/(\d+)\s*(volunteers?|people|participants?)/);
    if (numberMatch) {
      return parseInt(numberMatch[1]);
    }
    
    // Look for keywords that suggest group size
    if (lowerDesc.includes('large group') || lowerDesc.includes('many volunteers')) {
      return 20;
    }
    if (lowerDesc.includes('small group') || lowerDesc.includes('few volunteers')) {
      return 5;
    }
    if (lowerDesc.includes('team') || lowerDesc.includes('group')) {
      return 10;
    }
    
    // Default estimate
    return 1;
  }

  /**
   * Get default image URL for a cause
   */
  private getDefaultImageForCause(cause: string): string {
    const defaultImages: { [key: string]: string } = {
      'environment': '/images/default-environment.jpg',
      'education': '/images/default-education.jpg',
      'health': '/images/default-health.jpg',
      'community': '/images/default-community.jpg',
      'animals': '/images/default-animals.jpg',
      'seniors': '/images/default-seniors.jpg',
      'children': '/images/default-children.jpg'
    };
    
    return defaultImages[cause.toLowerCase()] || '/images/default-volunteer.jpg';
  }

  /**
   * Get processing statistics for the last operation
   */
  getLastProcessingStats(): ProcessingStats | null {
    // This would be stored in instance variable in a real implementation
    return null;
  }
}

// Export singleton instance
export const resultsProcessor = new ResultsProcessor();